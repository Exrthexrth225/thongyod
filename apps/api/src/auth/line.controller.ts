import{BadRequestException,Body,Controller,Get,Header,HttpCode,Post,Query,Req,Res}from'@nestjs/common'
import type{IncomingMessage,ServerResponse}from'node:http'
import{LineService,authCookie}from'./line.service.js'
import{assertMutationOrigin}from'./policy.js'
@Controller('auth')
export class LineController{
 constructor(private readonly line:LineService){}
 @Get('options') @Header('Cache-Control','no-store')
 options(){return this.line.options()}
 @Get('line') @Header('Cache-Control','no-store')
 async begin(@Query('returnTo') returnTo:unknown,@Res() res:ServerResponse){const result=await this.line.begin(returnTo);res.setHeader('Set-Cookie',result.cookie);res.setHeader('Location',result.url);res.statusCode=302;res.end()}
 @Get('line/callback') @Header('Cache-Control','no-store')
 async callback(@Req() req:IncomingMessage,@Query() query:Record<string,unknown>,@Res() res:ServerResponse){
  try{const result=await this.line.callback(req,query);res.setHeader('Set-Cookie',result.cookies);res.setHeader('Location',result.location)}
  catch{res.setHeader('Set-Cookie',authCookie('thongyod_login','',0));res.setHeader('Location','/login?error=LINE_LOGIN_FAILED')}
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.statusCode=302;res.end()
 }
 @Get('signup') @Header('Cache-Control','no-store')
 info(@Req() req:IncomingMessage){return this.line.signupInfo(req)}
 @Post('signup') @HttpCode(200) @Header('Cache-Control','no-store')
 async signup(@Req() req:IncomingMessage,@Body() body:unknown,@Res({passthrough:true}) res:ServerResponse){
  assertMutationOrigin(req)
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new BadRequestException({error:{code:'INVALID_REQUEST'}})
  const result=await this.line.signup(req,body);res.setHeader('Set-Cookie',result.cookies);return{returnTo:result.returnTo}
 }
}
