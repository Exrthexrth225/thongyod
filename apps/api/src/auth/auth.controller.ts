import { BadRequestException, Body, Controller, Get, Header, HttpCode, Patch, Post, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SessionService } from './session.service.js'
import { assertMutationOrigin } from './policy.js'
import { clearSessionCookie } from './cookie.js'
import { guestCookie } from './room-guest.service.js'
import { RoomsService } from '../rooms/rooms.service.js'

@Controller()
export class AuthController {
  constructor(private readonly sessions: SessionService, private readonly rooms: RoomsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() request: IncomingMessage) { return this.sessions.me(request) }

  @Patch('me')
  @Header('Cache-Control', 'no-store')
  updateMe(@Body() body: unknown, @Req() request: IncomingMessage) {
    assertMutationOrigin(request)
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    }
    return this.sessions.updateMe(request, body)
  }

  @Post('auth/logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(@Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse): Promise<void> {
    assertMutationOrigin(request)
    await this.rooms.logout(request)
    response.setHeader('Set-Cookie', [clearSessionCookie(), guestCookie()])
  }
}
