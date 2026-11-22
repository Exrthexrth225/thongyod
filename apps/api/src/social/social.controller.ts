import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import { SessionService } from '../auth/session.service.js'
import { SocialService } from './social.service.js'
import { assertMutationOrigin } from '../auth/policy.js'

@Controller()
export class SocialController {
  constructor(private readonly sessions: SessionService, private readonly social: SocialService) {}

  private async mutationViewer(request: IncomingMessage): Promise<string> {
    assertMutationOrigin(request)
    return (await this.sessions.me(request)).userId
  }

  @Post('friends/requests/:id/accept')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async accept(@Req() request: IncomingMessage, @Param('id') id: string): Promise<void> {
    await this.social.requestAction(await this.mutationViewer(request), id, true)
  }

  @Delete('friends/requests/:id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async removeRequest(@Req() request: IncomingMessage, @Param('id') id: string): Promise<void> {
    await this.social.requestAction(await this.mutationViewer(request), id, false)
  }

  @Delete('friends/:id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async unfriend(@Req() request: IncomingMessage, @Param('id') id: string): Promise<void> {
    await this.social.unfriend(await this.mutationViewer(request), id)
  }

  @Post('blocks')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async block(@Req() request: IncomingMessage, @Body() body: unknown): Promise<void> {
    const viewer = await this.mutationViewer(request)
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
    }
    await this.social.block(viewer, body)
  }

  @Delete('blocks/:id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async unblock(@Req() request: IncomingMessage, @Param('id') id: string): Promise<void> {
    await this.social.unblock(await this.mutationViewer(request), id)
  }

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
