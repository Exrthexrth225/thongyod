import 'reflect-metadata'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {Pool} from 'pg'
import {NestFactory} from '@nestjs/core'
import {AppModule} from '../dist/app.module.js'
import {databaseConfig,assertLocalDatabase} from '../dist/db/config.js'
import {migrateDatabase} from '../dist/db/migrate.js'
import {safeReturnTo} from '../dist/auth/line.service.js'
test('login return targets stay on this origin',()=>{
 for(const bad of ['//evil.example','/\\evil.example','/%2f%2fevil.example','https://evil.example','/login','/signup','/\n/evil.example'])assert.equal(safeReturnTo(bad),'/',bad)
 assert.equal(safeReturnTo('/games/rooms/123456?join=1#room'),'/games/rooms/123456?join=1#room')
})
test('LINE code PKCE flow validates nonce, binds browser, prevents replay and creates unique signup sessions',{skip:!process.env.PGPASSWORD?'Configure separate test database':false},async()=>{
 const originalEnv={...process.env},originalFetch=globalThis.fetch
 process.env.PGDATABASE=process.env.TEST_PGDATABASE;process.env.APP_ENCRYPTION_KEY=randomBytes(32).toString('base64');process.env.LINE_CHANNEL_ID='123456';process.env.LINE_CHANNEL_SECRET='test-channel-secret'
 const config=databaseConfig();assertLocalDatabase(config,'thongyod_test');const pool=new Pool(config),subject='U'+randomUUID().replaceAll('-',''),handle='line_'+randomBytes(5).toString('hex');let app,current,invalidNonce=false,providerCalls=0
 globalThis.fetch=async(input,init)=>{
  const url=String(input)
  if(url==='https://api.line.me/oauth2/v2.1/token'){
   providerCalls++;const b=init.body;assert.equal(b.get('client_secret'),'test-channel-secret');assert.equal(b.get('code'),'test-code');assert.equal(createHash('sha256').update(b.get('code_verifier')).digest('base64url'),current.searchParams.get('code_challenge'))
   return Response.json({id_token:'verified-by-line'})
  }
  if(url==='https://api.line.me/oauth2/v2.1/verify'){
   assert.equal(init.body.get('nonce'),current.searchParams.get('nonce'))
   return Response.json({iss:'https://access.line.me',aud:'123456',sub:subject,name:'LINE Test',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),nonce:invalidNonce?'wrong':current.searchParams.get('nonce')})
  }
  return originalFetch(input,init)
 }
 try{
  await migrateDatabase(pool)
  app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');const url=await app.getUrl()
  const get=(path,cookie)=>fetch(url+path,{redirect:'manual',headers:cookie?{Cookie:cookie}:{}})
  const begin=async(returnTo='/games/rooms/123456')=>{
   const r=await get('/auth/line?returnTo='+encodeURIComponent(returnTo));assert.equal(r.status,302);assert.equal(r.headers.get('cache-control'),'no-store');current=new URL(r.headers.get('location'));assert.equal(current.origin,'https://access.line.me');assert.equal(current.searchParams.get('code_challenge_method'),'S256');return{cookie:r.headers.getSetCookie()[0].split(';')[0],path:'/auth/line/callback?code=test-code&state='+current.searchParams.get('state')}
  }
  let attempt=await begin()
  const stolen=await get(attempt.path);assert.equal(stolen.headers.get('location'),'/login?error=LINE_LOGIN_FAILED');assert.equal(providerCalls,0)
  const callback=await get(attempt.path,attempt.cookie);assert.equal(callback.headers.get('location'),'/signup')
  const signupCookie=callback.headers.getSetCookie().find(c=>c.startsWith('thongyod_signup=')).split(';')[0]
  assert.equal((await get(attempt.path,attempt.cookie)).headers.get('location'),'/login?error=LINE_LOGIN_FAILED');assert.equal(providerCalls,1)
  const info=await get('/auth/signup',signupCookie);assert.equal(info.status,200);assert.deepEqual(await info.json(),{suggestedDisplayName:'LINE Test'})
  const signup=(body,origin='http://localhost:5173')=>fetch(url+'/auth/signup',{method:'POST',headers:{Cookie:signupCookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await signup({displayName:'Test',handle},'https://evil.example')).status,403)
  assert.equal((await signup({displayName:'!',handle})).status,400)
  const signed=await signup({displayName:'LINE Test',handle});assert.equal(signed.status,200,await signed.clone().text());assert.equal((await signed.json()).returnTo,'/games/rooms/123456')
  const session=signed.headers.getSetCookie().find(c=>c.startsWith('thongyod_session='));assert.match(session,/HttpOnly/);assert.match(session,/Max-Age=2592000/)
  const me=await get('/me',session.split(';')[0]);assert.equal(me.status,200);const user=await me.json();assert.equal(user.handle,handle);assert.equal(Object.hasOwn(user,'providerSubject'),false)
  assert.equal((await signup({displayName:'LINE Test',handle})).status,401)
  attempt=await begin('//evil.example')
  const known=await get(attempt.path,attempt.cookie+'; '+session.split(';')[0]);assert.equal(known.headers.get('location'),'/')
  assert.equal((await get('/me',session.split(';')[0])).status,401)
  const freshSession=known.headers.getSetCookie().find(c=>c.startsWith('thongyod_session='));assert.equal((await get('/me',freshSession.split(';')[0])).status,200)
  assert.equal((await pool.query('SELECT count(*)::int n FROM auth_identities WHERE provider_subject=$1',[subject])).rows[0].n,1)
  invalidNonce=true;attempt=await begin();assert.equal((await get(attempt.path,attempt.cookie)).headers.get('location'),'/login?error=LINE_LOGIN_FAILED')
  delete process.env.LINE_CHANNEL_SECRET;assert.equal((await get('/auth/line')).status,503)
 }finally{
  globalThis.fetch=originalFetch;await app?.close()
  const rows=await pool.query('SELECT user_id FROM auth_identities WHERE provider_subject=$1',[subject]),ids=rows.rows.map(r=>r.user_id)
  for(const t of ['user_preferences','auth_sessions','auth_identities'])await pool.query(`DELETE FROM ${t} WHERE user_id=ANY($1::uuid[])`,[ids]);await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  // This suite exclusively owns its test attempts and tickets (tests run serially).
  await pool.query('DELETE FROM auth_login_attempts');await pool.query('DELETE FROM auth_signup_tickets');await pool.end()
  for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv)
 }
})
