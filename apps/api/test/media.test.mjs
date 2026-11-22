import 'reflect-metadata'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sharp from 'sharp'
import {Pool} from 'pg'
import {NestFactory} from '@nestjs/core'
import {AppModule} from '../dist/app.module.js'
import {databaseConfig,assertLocalDatabase} from '../dist/db/config.js'
import {migrateDatabase} from '../dist/db/migrate.js'
import {sessionHash} from '../dist/auth/cookie.js'
import {MediaService} from '../dist/social/media.service.js'
test('photo endpoints validate actual bytes, strip metadata, resize, return Me and delete objects',{skip:!process.env.PGPASSWORD?'Configure separate test database':false},async()=>{
 const previousDb=process.env.PGDATABASE,previousDir=process.env.MEDIA_LOCAL_DIR,previousStorage=process.env.MEDIA_STORAGE,previousUrl=process.env.MEDIA_SUPABASE_URL,previousBucket=process.env.MEDIA_BUCKET,previousKey=process.env.MEDIA_SERVICE_KEY,previousPool=process.env.PGPOOL_MAX,originalFetch=globalThis.fetch
 process.env.PGDATABASE=process.env.TEST_PGDATABASE;process.env.MEDIA_STORAGE='local';process.env.PGPOOL_MAX='1';const dir=await mkdtemp(join(tmpdir(),'thongyod-media-'));process.env.MEDIA_LOCAL_DIR=dir
 const config=databaseConfig();assertLocalDatabase(config,'thongyod_test');const pool=new Pool(config),id=randomUUID(),token=randomBytes(32).toString('base64url');let app
 try{
  await migrateDatabase(pool)
  await pool.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,$3,$4)',[id,'Photo_User','photo_user','photo_'+id.slice(0,8)])
  await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')",[randomUUID(),id,sessionHash(token)])
  app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');const url=await app.getUrl()
  const upload=(kind,bytes,type='image/jpeg',auth=true)=>{const form=new FormData();form.append('file',new Blob([bytes],{type}),'test.jpg');return fetch(url+'/me/'+kind,{method:'POST',headers:{Origin:'http://localhost:5173',...(auth?{Cookie:`thongyod_session=${token}`}:{})},body:form})}
  const input=await sharp({create:{width:30,height:50,channels:3,background:'red'}}).jpeg().withMetadata().toBuffer()
  assert.equal((await upload('avatar',input,'image/jpeg',false)).status,401)
  assert.equal((await upload('avatar',Buffer.from('<svg></svg>'))).status,400)
  assert.equal((await upload('avatar',Buffer.alloc(5*1024*1024+1))).status,413)
  const saved=await upload('avatar',input,'text/plain');assert.equal(saved.status,200)
  const me=await saved.json();assert.equal(me.userId,id);assert.equal(me.displayName,'Photo_User');assert.ok(me.avatarUrl.startsWith('/media/'))
  const image=await fetch(url+me.avatarUrl);assert.equal(image.status,200)
  const meta=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.exif,undefined)
  const cover=await upload('cover',input);assert.equal(cover.status,200)
  const coverMe=await cover.json(),coverImage=await fetch(url+coverMe.coverUrl),coverMeta=await sharp(Buffer.from(await coverImage.arrayBuffer())).metadata();assert.equal(coverMeta.width,1500);assert.equal(coverMeta.height,500)
  const deleted=await fetch(url+'/me/avatar',{method:'DELETE',headers:{Origin:'http://localhost:5173',Cookie:`thongyod_session=${token}`}});assert.equal(deleted.status,200);assert.equal((await deleted.json()).avatarUrl,null);assert.equal((await fetch(url+me.avatarUrl)).status,404)
  process.env.MEDIA_STORAGE='supabase';process.env.MEDIA_SUPABASE_URL='https://storage.example.test';process.env.MEDIA_BUCKET='photos';process.env.MEDIA_SERVICE_KEY='server-only-test-key'
  const objects=new Map();let failUpload=false,failDelete=false
  globalThis.fetch=async(input,init)=>{
   if(String(input).startsWith('https://storage.example.test/storage/v1/object/')){
    assert.equal(init.headers.Authorization,'Bearer server-only-test-key');assert.equal(init.headers.apikey,'server-only-test-key')
    if(init.method==='POST'){if(failUpload)return new Response('',{status:503});objects.set(String(input),init.body);return Response.json({Key:'saved'})}
    if(init.method==='DELETE'){if(failDelete)return new Response('',{status:503});objects.delete(String(input));return Response.json({message:'Successfully deleted'})}
    throw new Error('Unexpected storage operation')
   }
   return originalFetch(input,init)
  }
  const remote=await upload('avatar',input);assert.equal(remote.status,200);const remoteMe=await remote.json();assert.ok(remoteMe.avatarUrl.startsWith('https://storage.example.test/storage/v1/object/public/photos/'));assert.equal(objects.size,1)
  failUpload=true;assert.equal((await upload('avatar',input)).status,503);assert.equal((await pool.query('SELECT avatar_url FROM users WHERE id=$1',[id])).rows[0].avatar_url,remoteMe.avatarUrl)
  failUpload=false;failDelete=true
  const remoteDelete=await fetch(url+'/me/avatar',{method:'DELETE',headers:{Origin:'http://localhost:5173',Cookie:`thongyod_session=${token}`}});assert.equal(remoteDelete.status,200)
  assert.equal((await pool.query('SELECT count(*)::int n FROM media_deletes WHERE url=$1',[remoteMe.avatarUrl])).rows[0].n,1)
  failDelete=false;await app.get(MediaService).cleanup();assert.equal(objects.size,0)
  assert.equal((await pool.query('SELECT count(*)::int n FROM media_deletes WHERE url=$1',[remoteMe.avatarUrl])).rows[0].n,0)
 }finally{
  globalThis.fetch=originalFetch
  await app?.close();await pool.query('DELETE FROM auth_sessions WHERE user_id=$1',[id]);await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end();await rm(dir,{recursive:true,force:true})
  for(const[k,v]of[['PGDATABASE',previousDb],['MEDIA_LOCAL_DIR',previousDir],['MEDIA_STORAGE',previousStorage],['MEDIA_SUPABASE_URL',previousUrl],['MEDIA_BUCKET',previousBucket],['MEDIA_SERVICE_KEY',previousKey],['PGPOOL_MAX',previousPool]]){if(v===undefined)delete process.env[k];else process.env[k]=v}
 }
})
