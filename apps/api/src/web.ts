import type {NestExpressApplication} from '@nestjs/platform-express'
import type{IncomingMessage,ServerResponse}from'node:http'
import{readFileSync}from'node:fs'
import{resolve}from'node:path'
import{fileURLToPath}from'node:url'

export function configureWeb(app:NestExpressApplication){
  const serve=process.env.SERVE_WEB==='true'
  const root=resolve(process.env.WEB_DIST_DIR??fileURLToPath(new URL('../../web/dist/',import.meta.url)))
  const index=serve?readFileSync(resolve(root,'index.html')):null
  app.use((req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin')
    if(serve&&req.method==='GET'&&req.headers.accept?.includes('text/html')
      && !/^\/(api|auth|media|health)(\/|\?|$)/.test(req.url??'')){
      res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(index);return
    }
    if(/^\/api(?:\/|\?|$)/.test(req.url??''))req.url=(req.url??'').slice(4)||'/'
    next()
  })
  if(serve)app.useStaticAssets(root,{index:false,dotfiles:'deny',setHeaders:(res,path)=>{res.setHeader('X-Content-Type-Options','nosniff');if(/[\\/](sw\.js|index\.html)$/.test(path))res.setHeader('Cache-Control','no-cache')}})
}
