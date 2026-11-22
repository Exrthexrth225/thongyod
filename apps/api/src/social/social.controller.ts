import { Controller, Get, Header, Param, Query, Req } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import { SessionService } from '../auth/session.service.js'
import { SocialService } from './social.service.js'

@Controller()
export class SocialController {
  constructor(private readonly sessions: SessionService, private readonly social: SocialService) {}

  @Get('friends')
  @Header('Cache-Control', 'no-store')
  async friends(@Req() request: IncomingMessage, @Query() query: Record<string, unknown>) {
    return this.social.friends((await this.sessions.me(request)).userId, query)
  }

  @Get('friends/requests')
  @Header('Cache-Control', 'no-store')
  async requests(@Req() request: IncomingMessage) {
    return this.social.requests((await this.sessions.me(request)).userId)
  }

  @Get('users/search')
  @Header('Cache-Control', 'no-store')
  async search(@Req() request: IncomingMessage, @Query('handle') handle: unknown) {
    return this.social.search((await this.sessions.me(request)).userId, handle)
  }

  @Get('users/:id/mutual-friends')
  @Header('Cache-Control', 'no-store')
  async mutual(@Req() request: IncomingMessage, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.social.mutualFriends((await this.sessions.me(request)).userId, id, query)
  }

  @Get('gangs')
  @Header('Cache-Control', 'no-store')
  async gangs(@Req() request: IncomingMessage, @Query() query: Record<string, unknown>) {
    return this.social.gangs((await this.sessions.me(request)).userId, query)
  }
}
