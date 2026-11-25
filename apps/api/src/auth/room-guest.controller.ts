import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { assertMutationOrigin } from './policy.js'
import { RoomGuestService } from './room-guest.service.js'

@Controller('auth')
export class RoomGuestController {
  constructor(private readonly guests: RoomGuestService) {}

  @Get('room-identity') @Header('Cache-Control', 'no-store')
  identity(@Req() request: IncomingMessage) { return this.guests.identity(request) }

  @Post('room-guest') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async create(@Req() request: IncomingMessage, @Body() body: unknown, @Res({ passthrough: true }) response: ServerResponse) {
    assertMutationOrigin(request)
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    const result = await this.guests.create(request, body)
    if (result.cookie) response.setHeader('Set-Cookie', result.cookie)
    return result.identity
  }
}
