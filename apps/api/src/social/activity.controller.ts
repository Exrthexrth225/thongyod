import {BadRequestException,Body,Controller,Get,Header,HttpCode,Post,Query,Req} from '@nestjs/common'
import type {IncomingMessage} from 'node:http'
import {SessionService} from '../auth/session.service.js'
import {assertMutationOrigin} from '../auth/policy.js'
import {ActivityService} from './activity.service.js'
@Controller()
export class ActivityController{
  constructor(private readonly sessions:SessionService,private readonly activity:ActivityService){}
  @Get('home') @Header('Cache-Control','no-store')
  async home(@Req() req:IncomingMessage){return this.activity.home((await this.sessions.me(req)).userId)}
  @Get('notifications') @Header('Cache-Control','no-store')
  async notifications(@Req() req:IncomingMessage,@Query() query:Record<string,unknown>){return this.activity.list((await this.sessions.me(req)).userId,query)}
  @Post('notifications/read') @HttpCode(204) @Header('Cache-Control','no-store')
  async read(@Req() req:IncomingMessage,@Body() body:unknown){assertMutationOrigin(req);const viewer=(await this.sessions.me(req)).userId;if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new BadRequestException({error:{code:'INVALID_REQUEST'}});await this.activity.read(viewer,body)}
}
