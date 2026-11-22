import {BadRequestException,ConflictException,HttpException,Injectable,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import type{IncomingMessage}from'node:http'
import type{PoolClient}from'pg'
import{DatabaseService}from'../db/database.service.js'
import{decryptLink,encryptLink}from'../social/link-token.js'
import{profilePatch}from'./session.service.js'
import{readSessionCookie,sessionCookie,sessionHash}from'./cookie.js'
import{secureCookie}from'./policy.js'

const fail=()=>new UnauthorizedException({error:{code:'LINE_LOGIN_FAILED'}})
const random=()=>randomBytes(32).toString('base64url')
export function authCookie(name:string,token:string,maxAge=600){return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie()?'; Secure':''}`}
function cookie(req:IncomingMessage,name:string){const parts=(req.headers.cookie??'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));const value=parts[0]?.slice(name.length+1);return parts.length===1&&/^[A-Za-z0-9_-]{43}$/.test(value??'')?value!:null}
export function safeReturnTo(raw:unknown){
 if(typeof raw!=='string'||raw.length>2048||!raw.startsWith('/')||raw.startsWith('//'))return '/'
 try{const decoded=decodeURIComponent(raw);if(/[\\\u0000-\u0020\u007f]/.test(decoded)||decoded.startsWith('//'))return '/';const url=new URL(raw,'https://app.invalid');if(url.origin!=='https://app.invalid'||['/login','/signup'].includes(url.pathname))return '/';return url.pathname+url.search+url.hash}catch{return '/'}
}
function config(){
 const channel=process.env.LINE_CHANNEL_ID,secret=process.env.LINE_CHANNEL_SECRET
 const origin=process.env.APP_ORIGIN??(process.env.NODE_ENV==='development'&&process.env.APP_ENV==='local'?'http://localhost:5173':'')
 try{const u=new URL(origin);if(u.origin!==origin||(u.protocol!=='https:'&&!(process.env.NODE_ENV==='development'&&process.env.APP_ENV==='local'&&['localhost','127.0.0.1'].includes(u.hostname))))throw Error()
  const callback=process.env.LINE_CALLBACK_URL??origin+'/api/auth/line/callback',cb=new URL(callback)
  if(cb.origin!==origin||cb.pathname!=='/api/auth/line/callback'||cb.search||cb.hash||!channel||!/^\d+$/.test(channel)||!secret)throw Error()
  return{channel,secret,callback}
 }catch{throw new ServiceUnavailableException({error:{code:'LINE_NOT_CONFIGURED'}})}
}
type Signup={subject:string;suggestedDisplayName:string;returnTo:string}
@Injectable()
export class LineService{
 constructor(private readonly database:DatabaseService){}
 options(){try{config();encryptLink('configuration-check','line-config');return{lineAvailable:true}}catch{return{lineAvailable:false}}}
 private async transaction<T>(work:(c:PoolClient)=>Promise<T>){
  const c=await this.database.connection.connect().catch(()=>{throw new ServiceUnavailableException({error:{code:'AUTH_UNAVAILABLE'}})})
  try{await c.query('BEGIN');const value=await work(c);await c.query('COMMIT');return value}
  catch(e){await c.query('ROLLBACK').catch(()=>undefined);if(e instanceof HttpException)throw e;if((e as {code?:string}).code==='23505')throw new ConflictException({error:{code:'HANDLE_TAKEN'}});throw new ServiceUnavailableException({error:{code:'AUTH_UNAVAILABLE'}})}finally{c.release()}
 }
 async begin(returnTo:unknown){
  const cfg=config(),state=randomBytes(32).toString('hex'),browser=random(),verifier=random(),nonce=random(),hash=sessionHash(state)
  const data=encryptLink(JSON.stringify({verifier,nonce,returnTo:safeReturnTo(returnTo)}),'line-attempt:'+hash)
  await this.transaction(async c=>{
   await c.query('DELETE FROM auth_login_attempts WHERE expires_at<=now()');await c.query('DELETE FROM auth_signup_tickets WHERE expires_at<=now()')
   await c.query("INSERT INTO auth_login_attempts(state_hash,browser_hash,encrypted_data,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes')",[hash,sessionHash(browser),data])
  })
  const url=new URL('https://access.line.me/oauth2/v2.1/authorize')
  url.search=new URLSearchParams({response_type:'code',client_id:cfg.channel,redirect_uri:cfg.callback,state,scope:'openid profile',nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString()
  return{url:url.toString(),cookie:authCookie('thongyod_login',browser)}
 }
 private async provider(code:string,verifier:string,nonce:string){
  const cfg=config()
  try{
   const token=await fetch('https://api.line.me/oauth2/v2.1/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:cfg.callback,client_id:cfg.channel,client_secret:cfg.secret,code_verifier:verifier}),signal:AbortSignal.timeout(10000)})
   if(!token.ok)throw Error()
   const tokens=await token.json() as {id_token?:unknown};if(typeof tokens.id_token!=='string')throw Error()
   const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:tokens.id_token,client_id:cfg.channel,nonce}),signal:AbortSignal.timeout(10000)})
   if(!response.ok)throw Error()
   const claims=await response.json() as Record<string,unknown>,now=Date.now()/1000
   if(claims.iss!=='https://access.line.me'||claims.aud!==cfg.channel||claims.nonce!==nonce||typeof claims.exp!=='number'||claims.exp<=now
    ||typeof claims.iat!=='number'||claims.iat>now+60||typeof claims.sub!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub))throw Error()
   const raw=typeof claims.name==='string'?claims.name.normalize('NFC').trim().replace(/[^\p{Script=Thai}A-Za-z0-9 ._-]/gu,''):''
   const suggestedDisplayName=[...raw].slice(0,20).join('')
   return{subject:claims.sub,suggestedDisplayName:[...suggestedDisplayName].length>=2?suggestedDisplayName:''}
  }catch{throw fail()}
 }
 private async session(c:PoolClient,userId:string,request:IncomingMessage){
  const previous=readSessionCookie(request)
  if(previous)await c.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL',[sessionHash(previous)])
  const token=random(),expiresAt=new Date(Date.now()+30*86400000)
  await c.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',$4)",[randomUUID(),userId,sessionHash(token),expiresAt])
  return sessionCookie(token,expiresAt)
 }
 async callback(request:IncomingMessage,query:Record<string,unknown>){
  const browser=cookie(request,'thongyod_login'),{state,code}=query
  if(!browser||typeof state!=='string'||!/^[a-f0-9]{64}$/.test(state))throw fail()
  const hash=sessionHash(state)
  const attempt=await this.transaction(async c=>(await c.query<{encrypted_data:string}>('DELETE FROM auth_login_attempts WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>clock_timestamp() RETURNING encrypted_data',[hash,sessionHash(browser)])).rows[0])
  if(!attempt||typeof code!=='string'||code.length>2048||!code||query.error)throw fail()
  let data:{verifier:string;nonce:string;returnTo:string}
  try{data=JSON.parse(decryptLink(attempt.encrypted_data,'line-attempt:'+hash))}catch{throw fail()}
  const profile=await this.provider(code,data.verifier,data.nonce)
  return this.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['line:'+profile.subject])
   const existing=(await c.query<{user_id:string}>('SELECT user_id FROM auth_identities WHERE provider=\'line\' AND provider_subject=$1',[profile.subject])).rows[0]
   if(existing)return{location:safeReturnTo(data.returnTo),cookies:[authCookie('thongyod_login','',0),authCookie('thongyod_signup','',0),await this.session(c,existing.user_id,request)]}
   const ticket=random(),hash=sessionHash(ticket),payload:Signup={...profile,returnTo:safeReturnTo(data.returnTo)}
   await c.query("INSERT INTO auth_signup_tickets(token_hash,encrypted_data,expires_at) VALUES($1,$2,clock_timestamp()+interval '10 minutes')",[hash,encryptLink(JSON.stringify(payload),'line-signup:'+hash)])
   return{location:'/signup',cookies:[authCookie('thongyod_login','',0),authCookie('thongyod_signup',ticket)]}
  })
 }
 async signupInfo(request:IncomingMessage){
  const token=cookie(request,'thongyod_signup');if(!token)throw fail()
  return this.transaction(async c=>{
   const row=(await c.query<{encrypted_data:string}>('SELECT encrypted_data FROM auth_signup_tickets WHERE token_hash=$1 AND expires_at>clock_timestamp()',[sessionHash(token)])).rows[0]
   if(!row)throw fail()
   const data=JSON.parse(decryptLink(row.encrypted_data,'line-signup:'+sessionHash(token))) as Signup
   return{suggestedDisplayName:data.suggestedDisplayName}
  })
 }
 async signup(request:IncomingMessage,body:unknown){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['displayName','handle'].includes(k)))throw new BadRequestException({error:{code:'INVALID_REQUEST'}})
  const patch=profilePatch(body)
  if(!patch.displayName||!patch.handle)throw new BadRequestException({error:{code:'INVALID_REQUEST'}})
  const token=cookie(request,'thongyod_signup');if(!token)throw fail()
  return this.transaction(async c=>{
   const hash=sessionHash(token),row=(await c.query<{encrypted_data:string}>('SELECT encrypted_data FROM auth_signup_tickets WHERE token_hash=$1 AND expires_at>clock_timestamp() FOR UPDATE',[hash])).rows[0]
   if(!row)throw fail()
   const data=JSON.parse(decryptLink(row.encrypted_data,'line-signup:'+hash)) as Signup
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['line:'+data.subject])
   const existing=(await c.query<{user_id:string}>('SELECT user_id FROM auth_identities WHERE provider_subject=$1',[data.subject])).rows[0]
   const id=existing?.user_id??randomUUID()
   if(!existing){
    await c.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,lower(normalize($2,NFC)),$3)',[id,patch.displayName,patch.handle])
    await c.query("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES($1,$2,'line',$3)",[randomUUID(),id,data.subject])
    await c.query('INSERT INTO user_preferences(user_id) VALUES($1)',[id])
   }
   await c.query('DELETE FROM auth_signup_tickets WHERE token_hash=$1',[hash])
   return{returnTo:safeReturnTo(data.returnTo),cookies:[authCookie('thongyod_signup','',0),await this.session(c,id,request)]}
  })
 }
}
