import { BadRequestException,Controller,Delete,Get,Header,HttpCode,Param,Post,Req,Res,UploadedFile,UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { IncomingMessage,ServerResponse } from 'node:http'
import { SessionService } from '../auth/session.service.js'
import { assertMutationOrigin } from '../auth/policy.js'
import { MediaService } from './media.service.js'

@Controller()
export class MediaController {
  constructor(private readonly sessions:SessionService,private readonly media:MediaService){}
  private async actor(req:IncomingMessage){assertMutationOrigin(req);return(await this.sessions.me(req)).userId}
  private kind(kind:string):'avatar'|'cover'{if(kind!=='avatar'&&kind!=='cover')throw new BadRequestException({error:{code:'INVALID_REQUEST'}});return kind}
  @Post('me/:kind')
  @HttpCode(200)
  @Header('Cache-Control','no-store')
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:0}}))
  async upload(@Req() req:IncomingMessage,@Param('kind') kind:string,@UploadedFile() file?:{buffer:Buffer;size:number}){
    const viewer=await this.actor(req)
    if(!file)throw new BadRequestException({error:{code:'INVALID_IMAGE'}})
    await this.media.update(viewer,this.kind(kind),file)
    return this.sessions.me(req)
  }
  @Delete('me/:kind')
  @Header('Cache-Control','no-store')
  async remove(@Req() req:IncomingMessage,@Param('kind') kind:string){await this.media.update(await this.actor(req),this.kind(kind));return this.sessions.me(req)}
  @Get('media/:key')
  async image(@Param('key') key:string,@Res() res:ServerResponse){const data=await this.media.image(key);res.setHeader('Content-Type','image/webp');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.end(data)}
}
