import { BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { mkdir,readFile,unlink,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { DatabaseService } from '../db/database.service.js'

type Kind='avatar'|'cover'
const keyPattern=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$/
@Injectable()
export class MediaService {
  constructor(private readonly database:DatabaseService){}
  private timer?:ReturnType<typeof setInterval>
  onModuleInit(){this.timer=setInterval(()=>{void this.cleanup()},60000);this.timer.unref()}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
  private async cleanup(){
    try{
      const pending=await this.database.connection.query<{url:string}>('SELECT url FROM media_deletes ORDER BY created_at LIMIT 20')
      for(const item of pending.rows){await this.remove(item.url);await this.database.connection.query('DELETE FROM media_deletes WHERE url=$1',[item.url])}
    }catch{/* Durable queue retries next minute; a storage outage must not roll back a committed profile. */}
  }
  private config(){
    if(process.env.MEDIA_STORAGE==='supabase'){
      const url=new URL(process.env.MEDIA_SUPABASE_URL??'')
      const bucket=process.env.MEDIA_BUCKET??'',secret=process.env.MEDIA_SERVICE_KEY??''
      if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||!bucket||!/^[a-zA-Z0-9_-]+$/.test(bucket)||!secret)throw new Error('Storage configuration unavailable')
      return {base:url.origin+'/storage/v1/object',bucket,secret,local:false as const}
    }
    if(process.env.NODE_ENV!=='development'||process.env.APP_ENV!=='local')throw new Error('Persistent production storage required')
    return {dir:resolve(process.env.MEDIA_LOCAL_DIR??'apps/api/.media'),local:true as const}
  }
  private async store(key:string,data:Buffer){
    const c=this.config()
    if(c.local){await mkdir(c.dir,{recursive:true});await writeFile(resolve(c.dir,key),data,{flag:'wx'});return '/media/'+key}
    const r=await fetch(`${c.base}/${c.bucket}/${key}`,{method:'POST',headers:{Authorization:`Bearer ${c.secret}`,apikey:c.secret,'Content-Type':'image/webp','x-upsert':'false'},body:new Uint8Array(data),signal:AbortSignal.timeout(10000)})
    if(!r.ok)throw new Error('Object upload failed')
    return `${c.base}/public/${c.bucket}/${key}`
  }
  private async remove(url:string|null){
    if(!url)return
    const c=this.config(),prefix=c.local?'/media/':`${c.base}/public/${c.bucket}/`
    if(!url.startsWith(prefix))return // Never delete fixture assets or arbitrary URLs.
    const key=url.slice(prefix.length);if(!keyPattern.test(key))return
    if(c.local){await unlink(resolve(c.dir,key)).catch(e=>{if(e.code!=='ENOENT')throw e});return}
    const r=await fetch(`${c.base}/${c.bucket}/${key}`,{method:'DELETE',headers:{Authorization:`Bearer ${c.secret}`,apikey:c.secret},signal:AbortSignal.timeout(10000)})
    if(!r.ok&&r.status!==404)throw new Error('Object delete failed')
  }
  async image(key:string){
    if(!keyPattern.test(key))throw new NotFoundException()
    try{const c=this.config();if(!c.local)throw new Error();return await readFile(resolve(c.dir,key))}
    catch{throw new NotFoundException()}
  }
  async update(viewer:string,kind:Kind,file?:{buffer:Buffer;size:number}){
    let data:Buffer|undefined
    if(file){
      if(!file.size||file.size>5*1024*1024)throw new BadRequestException({error:{code:'INVALID_IMAGE'}})
      try{
        const image=sharp(file.buffer,{limitInputPixels:40000000,failOn:'warning'})
        const meta=await image.metadata()
        if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)>1)throw new Error()
        data=await image.rotate().resize(kind==='avatar'?512:1500,kind==='avatar'?512:500,{fit:'cover'}).webp({quality:85}).toBuffer()
      }catch{throw new BadRequestException({error:{code:'INVALID_IMAGE'}})}
    }
    let uploaded:string|null=null
    const client=await this.database.connection.connect().catch(()=>{throw new ServiceUnavailableException({error:{code:'MEDIA_UNAVAILABLE'}})})
    try{
      if(data)uploaded=await this.store(randomUUID()+'.webp',data)
      await client.query('BEGIN')
      const column=kind==='avatar'?'avatar_url':'cover_url'
      const old=(await client.query(`SELECT ${column} AS url FROM users WHERE id=$1 FOR UPDATE`,[viewer])).rows[0]
      if(old.url)await client.query('INSERT INTO media_deletes(url) VALUES($1) ON CONFLICT DO NOTHING',[old.url])
      await client.query(`UPDATE users SET ${column}=$2 WHERE id=$1`,[viewer,uploaded])
      await client.query('COMMIT')
      return {[kind==='avatar'?'avatarUrl':'coverUrl']:uploaded}
    }catch(error){
      await client.query('ROLLBACK').catch(()=>undefined)
      if(uploaded)await this.remove(uploaded).catch(()=>undefined)
      if(error instanceof HttpException)throw error
      throw new ServiceUnavailableException({error:{code:'MEDIA_UNAVAILABLE'}})
    }finally{client.release();await this.cleanup()}
  }
}
