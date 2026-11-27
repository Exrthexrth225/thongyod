import { BadRequestException, Body, Controller, Get, Header, HttpCode, HttpException, Param, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { RoomGuestService } from '../auth/room-guest.service.js'
import { assertMutationOrigin } from '../auth/policy.js'
import { RoomsService } from './rooms.service.js'
import { clientAddress, RateLimiter } from './room-support.js'

const tooMany = () => new HttpException({ error: { code: 'RATE_LIMITED' } }, 429)

/** REST stays compatible with the original rooms contract; sockets are the fast path (rooms.sockets.ts). */
@Controller('rooms')
export class RoomsController {
  private readonly lookups = new RateLimiter(60, 60_000)
  private readonly creates = new RateLimiter(10, 60_000)
  private readonly boardRequests = new RateLimiter(6, 60_000)
  constructor(private readonly guests: RoomGuestService, private readonly rooms: RoomsService) {}

  private async actor(req: IncomingMessage, json = false) {
    assertMutationOrigin(req)
    const id = await this.guests.actor(req)
    if (json && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    return id
  }

  @Get(':code') @Header('Cache-Control', 'no-store')
  async get(@Req() req: IncomingMessage, @Param('code') code: string) {
    if (!this.lookups.allow(clientAddress(req))) throw tooMany()
    return this.rooms.get(await this.guests.actor(req), code)
  }

  @Post() @Header('Cache-Control', 'no-store')
  async create(@Req() req: IncomingMessage, @Body() body: unknown) {
    const actor = await this.actor(req, true)
    if (!this.creates.allow(actor.playerId)) throw tooMany()
    return this.rooms.create(actor, body)
  }

  @Patch(':code/settings') @Header('Cache-Control', 'no-store')
  async settings(@Req() req: IncomingMessage, @Param('code') code: string, @Body() body: unknown) {
    return this.rooms.action(await this.actor(req, true), code, 'settings', body)
  }

  @Post(':code/invite') @HttpCode(204) @Header('Cache-Control', 'no-store')
  async invite(@Req() req: IncomingMessage, @Param('code') code: string, @Body() body: unknown) {
    await this.rooms.invite(await this.actor(req, true), code, body)
  }

  /** A device asks to be this room's Board Screen. Sets a room-bound, HttpOnly board cookie. */
  @Post(':code/boards') @Header('Cache-Control', 'no-store')
  async requestBoard(@Req() req: IncomingMessage, @Res({ passthrough: true }) res: ServerResponse, @Param('code') code: string) {
    assertMutationOrigin(req)
    if (!this.boardRequests.allow(clientAddress(req))) throw tooMany()
    const who = await this.guests.actor(req).then((a) => a.playerId, () => null)
    const { session, cookie } = await this.rooms.requestBoard(req, code, who)
    if (cookie) res.setHeader('Set-Cookie', cookie)
    return session
  }

  @Get(':code/board') @Header('Cache-Control', 'no-store')
  async board(@Req() req: IncomingMessage, @Param('code') code: string) {
    const board = await this.rooms.boardFromCookie(req)
    if (!board || board.roomCode !== code) throw new UnauthorizedException({ error: { code: 'BOARD_UNPAIRED' } })
    return this.rooms.boardSession(board)
  }

  @Post(':code/:action') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async action(@Req() req: IncomingMessage, @Param('code') code: string, @Param('action') action: string, @Body() body: unknown) {
    const withBody = ['vote', 'boardApprove', 'boardReject', 'boardRevoke', 'boss', 'bossSkip', 'bossKick', 'makeBoard'].includes(action)
    const viewer = await this.actor(req, withBody)
    if (!['join', 'leave', 'start', 'reveal', 'lobby', 'vote', 'claimHost', 'boardApprove', 'boardReject', 'boardRevoke', 'boss', 'bossSkip', 'bossKick', 'makeBoard', 'closeRoom'].includes(action)) throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    return this.rooms.action(viewer, code, action, body)
  }
}
