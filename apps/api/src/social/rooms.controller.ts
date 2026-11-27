import { BadRequestException, Body, Controller, Get, Header, HttpCode, NotFoundException, Param, Patch, Post, Req, Sse } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import { RoomGuestService } from '../auth/room-guest.service.js'
import { assertMutationOrigin } from '../auth/policy.js'
import { RoomsService } from './rooms.service.js'

@Controller('rooms')
export class RoomsController {
  constructor(private readonly guests: RoomGuestService, private readonly rooms: RoomsService) {}

  private async actor(req: IncomingMessage, json = false) {
    assertMutationOrigin(req)
    const id = await this.guests.actor(req)
    if (json && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    }
    return id
  }

  @Get(':code')
  @Header('Cache-Control', 'no-store')
  async get(@Req() req: IncomingMessage, @Param('code') code: string) {
    return this.rooms.action(await this.guests.actor(req), code)
  }

  @Sse(':code/events')
  async events(@Req() req: IncomingMessage, @Param('code') code: string) {
    if (!/^\d{6}$/.test(code)) throw new NotFoundException({ error: { code: 'ROOM_NOT_FOUND' } })
    await this.guests.actor(req)
    return this.rooms.stream(code)
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Req() req: IncomingMessage, @Body() body: unknown) {
    return this.rooms.create(await this.actor(req, true), body)
  }

  @Patch(':code/settings')
  @Header('Cache-Control', 'no-store')
  async settings(@Req() req: IncomingMessage, @Param('code') code: string, @Body() body: unknown) {
    return this.rooms.action(await this.actor(req, true), code, 'settings', body)
  }

  @Post(':code/invite')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async invite(@Req() req: IncomingMessage, @Param('code') code: string, @Body() body: unknown) {
    await this.rooms.action(await this.actor(req, true), code, 'invite', body)
  }

  @Post(':code/:action')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async action(@Req() req: IncomingMessage, @Param('code') code: string, @Param('action') action: string, @Body() body: unknown) {
    const viewer = await this.actor(req, action === 'vote' || action === 'boss')
    if (!['join', 'leave', 'start', 'reveal', 'lobby', 'vote', 'boss'].includes(action)) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    }
    return this.rooms.action(viewer, code, action, body)
  }
}
