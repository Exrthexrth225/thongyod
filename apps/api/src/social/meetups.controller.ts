import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import { SessionService } from '../auth/session.service.js'
import { assertMutationOrigin } from '../auth/policy.js'
import { MeetupsService } from './meetups.service.js'

@Controller('meetups')
export class MeetupsController {
  constructor(private readonly sessions: SessionService,private readonly meetups: MeetupsService) {}
  private async actor(req: IncomingMessage,json=true) {
    assertMutationOrigin(req)
    const user=(await this.sessions.me(req)).userId
    if(json&&!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new BadRequestException({error:{code:'INVALID_REQUEST'}})
    return user
  }
  @Header('Cache-Control','no-store')
  @Get() async list(@Req() req:IncomingMessage,@Query() query:Record<string,unknown>){return this.meetups.list((await this.sessions.me(req)).userId,query)}
  @Header('Cache-Control','no-store')
  @Get(':id') async detail(@Req() req:IncomingMessage,@Param('id') id:string){return this.meetups.detail((await this.sessions.me(req)).userId,id)}
  @Header('Cache-Control','no-store')
  @Post() async create(@Req() req:IncomingMessage,@Body() body:unknown){return this.meetups.create(await this.actor(req),body)}
  @Header('Cache-Control','no-store')
  @Put(':id/response') async respond(@Req() req:IncomingMessage,@Param('id') id:string,@Body() body:unknown){return this.meetups.respond(await this.actor(req),id,body)}
  @Header('Cache-Control','no-store')
  @Delete(':id/response') async clear(@Req() req:IncomingMessage,@Param('id') id:string,@Query('scheduleVersion') version:unknown){
    const actor=await this.actor(req,false)
    if(typeof version!=='string'||!/^\d+$/.test(version))throw new BadRequestException({error:{code:'INVALID_REQUEST'}})
    return this.meetups.respond(actor,id,{scheduleVersion:Number(version)},true)
  }
  @Header('Cache-Control','no-store')
  @Put(':id/visibility') async visibility(@Req() req:IncomingMessage,@Param('id') id:string,@Body() body:unknown){return this.meetups.visibility(await this.actor(req),id,body)}
}
