import 'reflect-metadata'
import assert from 'node:assert/strict'
import{test}from'node:test'
import{mkdtemp,writeFile,mkdir,rm}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{NestFactory}from'@nestjs/core'
import{AppModule}from'../dist/app.module.js'
import{configureWeb}from'../dist/web.js'
import{databaseConfig}from'../dist/db/config.js'
test('managed Postgres URLs preserve verified TLS and bounded pools',()=>{
 const cfg=databaseConfig({NODE_ENV:'production',DATABASE_URL:'postgresql://app:p%40ss@db.example.test/mydb?sslmode=require&channel_binding=require',PGPOOL_MAX:'3'})
 assert.equal(cfg.host,'db.example.test');assert.equal(cfg.password,'p@ss');assert.deepEqual(cfg.ssl,{rejectUnauthorized:true});assert.equal(cfg.max,3)
 assert.equal(cfg.enableChannelBinding,true)
 for(const env of [{PGSSLMODE:'disable'}, {PGPOOL_MAX:'50'}, {DATABASE_URL:'postgresql://app:pass@db.example/db?sslmode=disable'}, {DATABASE_URL:'https://evil.example'}])assert.throws(()=>databaseConfig({NODE_ENV:'production',DATABASE_URL:'postgresql://app:pass@db.example/db',...env}))
 assert.equal(databaseConfig({NODE_ENV:'production',DATABASE_URL:'postgresql://app:pass@127.0.0.1/db?sslmode=disable'}).ssl,false)
})
test('same-origin hosting serves SPA deep links, assets and prefixed API without replacing legacy JSON routes',async()=>{
 const prev={SERVE_WEB:process.env.SERVE_WEB,WEB_DIST_DIR:process.env.WEB_DIST_DIR},dir=await mkdtemp(join(tmpdir(),'thongyod-web-'));let app
 try{
  await writeFile(join(dir,'index.html'),'<!doctype html><title>Thongyod test</title>');await mkdir(join(dir,'assets'));await writeFile(join(dir,'assets','app.js'),'window.thongyod=true;')
  process.env.SERVE_WEB='true';process.env.WEB_DIST_DIR=dir
  app=await NestFactory.create(AppModule,{logger:false});configureWeb(app);await app.listen(0,'127.0.0.1');const url=await app.getUrl()
  for(const path of ['/','/login','/signup','/me','/games/rooms/123456']){const r=await fetch(url+path,{headers:{Accept:'text/html'}});assert.equal(r.status,200);assert.match(await r.text(),/Thongyod test/);assert.equal(r.headers.get('cache-control'),'no-store')}
  for(const path of ['/me','/api/me']){const r=await fetch(url+path);assert.equal(r.status,401);assert.equal((await r.json()).error.code,'UNAUTHENTICATED')}
  assert.equal((await fetch(url+'/api/not-real',{headers:{Accept:'text/html'}})).status,404)
  const asset=await fetch(url+'/assets/app.js');assert.equal(asset.status,200);assert.match(await asset.text(),/window.thongyod/)
  assert.equal((await fetch(url+'/api/health')).status,200)
 }finally{await app?.close();await rm(dir,{recursive:true,force:true});for(const[k,v]of Object.entries(prev)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
})
