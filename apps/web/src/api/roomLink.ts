// Live link to a game room over Socket.IO (DECISIONS #135). The database is the source of truth:
// a (re)connect just watches the room again and gets a fresh snapshot, so nothing depends on
// Socket.IO's own recovery. While the link is down, useRoom falls back to polling REST.
import { io, type Socket } from 'socket.io-client'
import type { Room, RoomBoard, RoomClientEvents, RoomCommand, RoomCommandResult, RoomServerEvents } from '@thongyod/shared'

type Mode = 'seat' | 'board'
export type RoomLinkState = { connected: boolean; watching: string | null; control: boolean; board: Pick<RoomBoard, 'label' | 'status'> | null; closed: boolean }
type Handlers = { onView: (room: Room) => void; onClosed: () => void }

const MOCKABLE = ['auth', 'me', 'profiles', 'friends', 'gangs', 'meetups', 'home', 'notifications', 'rooms']

/** Sockets need the real backend: never in the Pages demo, and in dev only when rooms are not mocked. */
export function roomSocketsEnabled(env: { DEV?: boolean; VITE_DEPLOY_MOCKS?: string; VITE_API_MOCKS?: string } = import.meta.env): boolean {
  if (env.VITE_DEPLOY_MOCKS === 'true') return false
  if (!env.DEV) return true
  const value = (env.VITE_API_MOCKS ?? 'all').trim()
  if (value === 'off') return true
  if (value === '' || value === 'all' || value === 'on') return false
  return !value.split(',').map((v) => v.trim()).filter((v) => MOCKABLE.includes(v)).includes('rooms')
}

/** RFC 4122 v4 id. crypto.randomUUID is missing on plain-http LAN dev pages, so build it ourselves. */
export function newActionId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Keeps the snapshot with the highest revision; equal revisions refresh per-viewer bits (online list). */
export function newerRoom(current: Room | undefined, next: Room): Room {
  if (!current || current.code !== next.code) return next
  return next.revision >= current.revision ? next : current
}

export class RoomLink {
  private socket: Socket<RoomServerEvents, RoomClientEvents> | null = null
  private handlers: Handlers | null = null
  private state: RoomLinkState = { connected: false, watching: null, control: true, board: null, closed: false }
  private readonly listeners = new Set<() => void>()
  private readonly waiters = new Set<{ code: string; revision: number; done: () => void }>()
  /** Opening a room takes my seat over from older tabs (DECISIONS #135); an automatic reconnect does not. */
  private claimOnWatch = false
  private readonly mode: Mode
  private readonly enabled: boolean
  constructor(mode: Mode, enabled = roomSocketsEnabled()) { this.mode = mode; this.enabled = enabled }

  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readonly getState = () => this.state
  private set(patch: Partial<RoomLinkState>) { this.state = { ...this.state, ...patch }; for (const l of this.listeners) l() }

  /** Starts watching a room; returns a function that stops. */
  watch(code: string, handlers: Handlers): () => void {
    if (!this.enabled) return () => undefined
    this.handlers = handlers
    this.set({ watching: code, closed: false, board: null, control: true })
    this.claimOnWatch = true
    const socket = this.ensure()
    if (socket.connected) void this.sendWatch(false)
    return () => {
      if (this.state.watching !== code) return
      this.handlers = null
      this.set({ watching: null })
      this.socket?.disconnect()
      this.socket = null
      this.set({ connected: false })
    }
  }

  /** Make this tab the one that acts for my seat (the other tab becomes view-only). */
  takeControl() { void this.sendWatch(true) }

  /** True when commands for this room can go over the socket now. */
  ready(code: string) { return this.enabled && this.state.connected && this.state.watching === code }

  /** Sends a command; retries the same actionId when an acknowledgement is lost. */
  async command(command: RoomCommand): Promise<RoomCommandResult> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const socket = this.socket
      if (socket?.connected) {
        try { return await socket.timeout(4000).emitWithAck('room:command', command) } catch { /* no ack: retry with the same id */ }
      } else await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    return { ok: false, status: 503, code: 'ROOMS_UNAVAILABLE' }
  }

  /** Resolves once a snapshot at or after `revision` has arrived (or after `ms`). */
  waitFor(code: string, revision: number, ms = 3000): Promise<void> {
    return new Promise((resolve) => {
      const waiter = { code, revision, done: () => { clearTimeout(timer); this.waiters.delete(waiter); resolve() } }
      const timer = setTimeout(waiter.done, ms)
      this.waiters.add(waiter)
    })
  }

  private ensure() {
    if (this.socket) return this.socket
    const socket: Socket<RoomServerEvents, RoomClientEvents> = io({
      path: '/api/socket.io', withCredentials: true, transports: ['websocket', 'polling'],
      auth: { as: this.mode }, reconnectionDelay: 1000, reconnectionDelayMax: 8000,
    })
    socket.on('connect', () => { this.set({ connected: true }); void this.sendWatch(false) })
    socket.on('disconnect', () => this.set({ connected: false }))
    socket.on('room:view', ({ room, control }) => {
      if (room.code !== this.state.watching) return
      this.set({ control, board: null })
      this.handlers?.onView(room)
      for (const w of [...this.waiters]) if (w.code === room.code && room.revision >= w.revision) w.done()
    })
    socket.on('room:board', ({ code, board }) => { if (code === this.state.watching) this.set({ board }) })
    socket.on('room:closed', ({ code }) => {
      if (code !== this.state.watching) return
      this.set({ closed: true })
      this.handlers?.onClosed()
    })
    this.socket = socket
    return socket
  }

  private async sendWatch(takeControl: boolean) {
    const code = this.state.watching, socket = this.socket
    if (!code || !socket?.connected) return
    const take = takeControl || this.claimOnWatch
    try {
      const result = await socket.timeout(5000).emitWithAck('room:watch', { code, takeControl: take })
      if (result.ok) this.claimOnWatch = false
      if (!result.ok && result.status === 404) { this.set({ closed: true }); this.handlers?.onClosed() }
      // 401: the credential changed (e.g. just joined as a guest); a fresh connection reads the new cookie.
      if (!result.ok && result.status === 401) { socket.disconnect(); setTimeout(() => { if (this.socket === socket && this.state.watching === code) socket.connect() }, 1500) }
    } catch { /* the next connect watches again */ }
  }
}

/** One link per tab for my seat, and one for a Board Screen. */
export const seatLink = new RoomLink('seat')
export const boardLink = new RoomLink('board')
