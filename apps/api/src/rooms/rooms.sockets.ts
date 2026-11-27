import { HttpException, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import type { RoomClientEvents, RoomCommandResult, RoomServerEvents } from '@thongyod/shared'
import { RoomGuestService, type RoomActor } from '../auth/room-guest.service.js'
import { assertMutationOrigin } from '../auth/policy.js'
import { RoomsService } from './rooms.service.js'
import { clientAddress, RateLimiter, RoomEvents, RoomPresence } from './room-support.js'

/** Same origin as the app; the client must use this exact path. */
export const ROOM_SOCKET_PATH = '/api/socket.io'

type Data = { actor?: RoomActor; board?: { id: string; roomCode: string }; code?: string; ready: Promise<void> }
type RoomSocket = Socket<RoomClientEvents, RoomServerEvents, Record<string, never>, Data>
const channel = (code: string) => `room:${code}`
const refused = (status: number, code: string): RoomCommandResult => ({ ok: false, status, code })

/**
 * Socket.IO on the API's own HTTP server (one instance). Sockets only carry commands and
 * per-viewer snapshots; the database row is the single source of truth, so a reconnect just
 * watches again and gets a fresh snapshot (no reliance on Socket.IO's state recovery).
 */
@Injectable()
export class RoomSockets implements OnApplicationBootstrap, OnModuleDestroy {
  private io?: Server<RoomClientEvents, RoomServerEvents, Record<string, never>, Data>
  private timer?: NodeJS.Timeout
  private sweeping = false
  private readonly connects = new RateLimiter(30, 60_000)
  private readonly commands = new RateLimiter(20, 1_000)
  private readonly onChanged = (code: string) => void this.publish(code)
  private readonly onClosed = (code: string) => {
    this.io?.to(channel(code)).emit('room:closed', { code })
    this.io?.in(channel(code)).socketsLeave(channel(code))
  }

  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly rooms: RoomsService,
    private readonly guests: RoomGuestService,
    private readonly presence: RoomPresence,
    private readonly events: RoomEvents,
  ) {}

  onApplicationBootstrap() {
    const server = this.adapter.httpAdapter.getHttpServer() as HttpServer
    this.io = new Server(server, {
      path: ROOM_SOCKET_PATH,
      serveClient: false,
      maxHttpBufferSize: 16 * 1024,
      allowRequest: (req, done) => {
        try { assertMutationOrigin(req) } catch { done('ORIGIN_NOT_ALLOWED', false); return }
        done(null, this.connects.allow(clientAddress(req)))
      },
    })
    this.io.on('connection', (socket) => this.connection(socket))
    this.events.on('changed', this.onChanged)
    this.events.on('closed', this.onClosed)
    // Deadlines live in the database, so a restart resolves overdue ones on its first sweep.
    this.timer = setInterval(() => void this.sweep(), 1000)
    this.timer.unref()
    void this.sweep()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
    this.events.off('changed', this.onChanged)
    this.events.off('closed', this.onClosed)
    // Leave the HTTP server to Nest; only drop our clients.
    this.io?.disconnectSockets(true)
    this.io?.engine.close()
  }

  private async sweep() {
    if (this.sweeping) return
    this.sweeping = true
    try { while (await this.rooms.sweep() > 0) { /* keep going while work is due */ } }
    catch { /* database unavailable: try again next tick */ }
    finally { this.sweeping = false }
  }

  private connection(socket: RoomSocket) {
    socket.data.ready = (async () => {
      // A Board Screen connects as a board even on a device that is also signed in.
      const asBoard = (socket.handshake.auth as { as?: unknown } | undefined)?.as === 'board'
      if (!asBoard) try { socket.data.actor = await this.guests.actor(socket.request) } catch { /* no seat credential */ }
      else {
        const board = await this.rooms.boardFromCookie(socket.request).catch(() => null)
        if (board) socket.data.board = { id: board.id, roomCode: board.roomCode }
      }
    })()

    socket.on('room:watch', async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined
      try {
        await socket.data.ready
        const code = data && typeof data === 'object' && typeof data.code === 'string' && /^\d{6}$/.test(data.code) ? data.code : null
        if (!code) { reply(refused(400, 'INVALID_REQUEST')); return }
        if (!socket.data.actor && !socket.data.board) { reply(refused(401, 'UNAUTHENTICATED')); return }
        if (socket.data.board && socket.data.board.roomCode !== code) { reply(refused(403, 'BOARD_OTHER_ROOM')); return }
        this.unwatch(socket)
        const snap = await this.rooms.snapshot(code)
        if (!snap) { reply(refused(404, 'ROOM_NOT_FOUND')); return }
        socket.data.code = code
        await socket.join(channel(code))
        if (socket.data.actor) {
          const playerId = socket.data.actor.playerId
          this.presence.connect(code, playerId, socket.id, data.takeControl === true)
          reply({ ok: true, revision: snap.revision })
          // Everyone (this socket included) gets the new online list.
          await this.publish(code)
        } else {
          reply({ ok: true, revision: snap.revision })
          this.sendTo(socket, snap)
        }
      } catch { reply(refused(503, 'ROOMS_UNAVAILABLE')) }
    })

    socket.on('room:command', async (cmd, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined
      try {
        await socket.data.ready
        if (!this.commands.allow(socket.id)) { reply(refused(429, 'RATE_LIMITED')); return }
        const actor = socket.data.actor
        if (!actor) { reply(refused(socket.data.board ? 403 : 401, socket.data.board ? 'BOARD_READ_ONLY' : 'UNAUTHENTICATED')); return }
        const code = cmd && typeof cmd === 'object' ? (cmd as { code?: unknown }).code : undefined
        if (typeof code !== 'string' || code !== socket.data.code) { reply(refused(409, 'NOT_WATCHING')); return }
        // Joining is how a new tab gets its seat; everything else needs the tab that controls the seat.
        const type = (cmd as { type?: unknown }).type
        if (type !== 'join' && !this.presence.isController(code, actor.playerId, socket.id)) { reply(refused(409, 'NOT_CONTROLLER')); return }
        reply(await this.rooms.command(actor, cmd))
      } catch (e) {
        reply(e instanceof HttpException ? refused(e.getStatus(), 'ERROR') : refused(503, 'ROOMS_UNAVAILABLE'))
      }
    })

    socket.on('disconnect', () => this.unwatch(socket))
  }

  private unwatch(socket: RoomSocket) {
    const code = socket.data.code
    if (!code) return
    void socket.leave(channel(code))
    socket.data.code = undefined
    if (socket.data.actor) {
      this.presence.disconnect(code, socket.data.actor.playerId, socket.id)
      void this.publish(code)
    }
  }

  private sendTo(socket: RoomSocket, snap: NonNullable<Awaited<ReturnType<RoomsService['snapshot']>>>) {
    const actor = socket.data.actor
    if (actor) {
      const room = snap.render({ kind: 'seat', playerId: actor.playerId })
      socket.emit('room:view', { room, control: this.presence.isController(room.code, actor.playerId, socket.id) })
      return
    }
    const board = socket.data.board
    if (!board) return
    const known = snap.board(board.id) ?? { label: '', status: 'revoked' as const }
    if (known.status === 'approved') { socket.emit('room:view', { room: snap.render({ kind: 'board', boardId: board.id }), control: false }); return }
    socket.emit('room:board', { code: board.roomCode, board: known })
    if (known.status !== 'pending') void socket.leave(channel(board.roomCode))
  }

  /** Sends every watcher its own snapshot of the committed state. */
  async publish(code: string) {
    if (!this.io) return
    try {
      const sockets = await this.io.in(channel(code)).fetchSockets()
      if (!sockets.length) return
      const snap = await this.rooms.snapshot(code)
      if (!snap) { this.onClosed(code); return }
      for (const remote of sockets) {
        const socket = this.io.sockets.sockets.get(remote.id)
        if (socket) this.sendTo(socket, snap)
      }
    } catch { /* the next change or a client resync will catch up */ }
  }
}
