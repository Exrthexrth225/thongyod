import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { MeetupDetailV1, MeetupSummaryV1, MeetupResponse } from '@thongyod/shared'
import { DatabaseService } from '../db/database.service.js'

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)
const invalid = () => new BadRequestException({ error: { code: 'INVALID_REQUEST' } })
const iso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v))
type Row = { id: string; gangId: string; gangName: string; title: string; startsAt: Date; createdAt: Date; scheduleVersion: number; createdBy: { userId: string; displayName: string; avatarUrl: string | null }; hidden: boolean; response: MeetupResponse | null; version: number | null }

@Injectable()
export class MeetupsService {
  constructor(private readonly database: DatabaseService) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    const client = await this.database.connection.connect().catch(() => { throw new ServiceUnavailableException({ error: { code: 'MEETUPS_UNAVAILABLE' } }) })
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
      const result = await work(client); await client.query('COMMIT'); return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (error instanceof HttpException) throw error
      throw new ServiceUnavailableException({ error: { code: 'MEETUPS_UNAVAILABLE' } })
    } finally { client.release() }
  }

  private async row(client: PoolClient, viewer: string, id: string, lock = false): Promise<Row> {
    if (!uuid(id)) throw new NotFoundException({ error: { code: 'MEETUP_NOT_FOUND' } })
    const result = await client.query<Row>(`SELECT m.id,m.gang_id AS "gangId",s.name AS "gangName",m.title,m.starts_at AS "startsAt",m.created_at AS "createdAt",m.schedule_version AS "scheduleVersion",
      json_build_object('userId',u.id,'displayName',u.display_name,'avatarUrl',u.avatar_url) AS "createdBy",
      coalesce(r.hidden_at IS NOT NULL,false) AS hidden,r.response,r.confirmed_schedule_version AS version
      FROM meetups m JOIN gang_settings s ON s.gang_id=m.gang_id JOIN users u ON u.id=m.created_by
      JOIN gang_members mine ON mine.gang_id=m.gang_id AND mine.user_id=$1 AND mine.left_at IS NULL
      LEFT JOIN meetup_responses r ON r.meetup_id=m.id AND r.user_id=$1
      WHERE m.id=$2 ${lock ? 'FOR UPDATE OF m FOR SHARE OF mine' : ''}`, [viewer,id])
    if (!result.rows[0]) throw new NotFoundException({ error: { code: 'MEETUP_NOT_FOUND' } })
    return result.rows[0]
  }

  private async project(client: PoolClient, viewer: string, row: Row, detail = false): Promise<MeetupSummaryV1 | MeetupDetailV1> {
    // Hidden rows are excluded even when the caller is recovering their hidden meetup.
    const people = (await client.query<{ userId: string; displayName: string; avatarUrl: string | null; response: MeetupResponse | null; version: number }>(`SELECT u.id AS "userId",u.display_name AS "displayName",u.avatar_url AS "avatarUrl",r.response,r.confirmed_schedule_version AS version
      FROM users u JOIN (SELECT user_id FROM gang_members WHERE gang_id=$1 AND left_at IS NULL
        UNION SELECT user_id FROM meetup_responses WHERE meetup_id=$2 AND response IS NOT NULL) g ON u.id=g.user_id
      LEFT JOIN meetup_responses r ON r.meetup_id=$2 AND r.user_id=g.user_id
      WHERE r.hidden_at IS NULL ORDER BY u.display_name COLLATE "C",u.id`,[row.gangId,row.id])).rows
    const effective = (p: typeof people[number]) => p.version === row.scheduleVersion ? p.response : null
    const counts = { going: 0, maybe: 0, not_going: 0 }
    for (const p of people) { const answer = effective(p); if (answer) counts[answer]++ }
    const needsReconfirm = !row.hidden && !!row.response && row.version !== row.scheduleVersion
    const myResponse = row.hidden || needsReconfirm ? null : row.response
    const summary: MeetupSummaryV1 = { id: row.id,title: row.title,gangId: row.gangId,gangName: row.gangName,startsAt: row.startsAt.toISOString(),createdBy: row.createdBy,
      scheduleVersion: row.scheduleVersion,responseLocksAt: new Date(row.startsAt.getTime()+600000).toISOString(),counts,myResponse,
      myState: { hidden: row.hidden,needsReconfirm,status: needsReconfirm ? 'needs_reconfirm' : myResponse ?? 'unanswered',waitlistPosition: null },
      goingAvatars: people.filter(p=>effective(p)==='going').slice(0,5).map(p=>({participantId:p.userId,displayName:p.displayName,avatarUrl:p.avatarUrl})) }
    if (!detail) return summary
    return { ...summary,createdAt: row.createdAt.toISOString(),minPeople:null,maxPeople:null,waitlistedCount:0,
      needsReconfirmCount:people.filter(p=>p.response && p.version!==row.scheduleVersion).length,
      members:people.map(p=>({participantId:p.userId,userId:p.userId,isGuest:false,displayName:p.displayName,avatarUrl:p.avatarUrl,response:effective(p),status:p.response && p.version!==row.scheduleVersion?'needs_reconfirm':effective(p)??'unanswered'})),
      attendance: { confirmationOpensAt:summary.responseLocksAt,confirmationDueAt:new Date(row.startsAt.getTime()+86400000).toISOString(),finalizedAt:null,finalizedBy:null,entries:[] } }
  }

  async detail(viewer: string, id: string, client?:PoolClient): Promise<MeetupDetailV1> {
    if(client)return this.project(client,viewer,await this.row(client,viewer,id),true) as Promise<MeetupDetailV1>
    return this.transaction(async client=>this.project(client,viewer,await this.row(client,viewer,id),true) as Promise<MeetupDetailV1>,true)
  }

  async list(viewer: string, query: Record<string, unknown>) {
    const { from,to,visibility='visible',limit='100',cursor }=query
    if (!iso(from)||!iso(to)||Date.parse(to)<=Date.parse(from)||Date.parse(to)-Date.parse(from)>93*86400000
      || !['visible','hidden','all'].includes(String(visibility)) || typeof visibility!=='string'
      || typeof limit!=='string'||!/^\d+$/.test(limit)||Number(limit)<1||Number(limit)>100) throw invalid()
    const scope=JSON.stringify([viewer,from,to,visibility]); let afterTime: string|null=null,afterId: string|null=null
    if (cursor!==undefined) {
      try {
        if(typeof cursor!=='string'||cursor.length>2048||!/^[A-Za-z0-9_-]+$/.test(cursor))throw invalid()
        const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!Array.isArray(c)||c.length!==3||c[0]!==scope||!iso(c[1])||!uuid(c[2]))throw invalid()
        afterTime=c[1];afterId=c[2]
      } catch {throw invalid()}
    }
    return this.transaction(async client=>{
      const ids=(await client.query<{id:string;at:string}>(`SELECT m.id,to_char(m.starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM meetups m
        JOIN gang_members mine ON mine.gang_id=m.gang_id AND mine.user_id=$1 AND mine.left_at IS NULL
        LEFT JOIN meetup_responses r ON r.meetup_id=m.id AND r.user_id=$1
        WHERE m.starts_at>=$2 AND m.starts_at<$3 AND ($4='all' OR (r.hidden_at IS NOT NULL)=($4='hidden'))
        AND ($5::timestamptz IS NULL OR (m.starts_at,m.id)>($5::timestamptz,$6::uuid)) ORDER BY m.starts_at,m.id LIMIT $7`,[viewer,from,to,visibility,afterTime,afterId,Number(limit)+1])).rows
      const items:MeetupSummaryV1[]=[]
      for(const item of ids.slice(0,Number(limit)))items.push(await this.project(client,viewer,await this.row(client,viewer,item.id)) as MeetupSummaryV1)
      const last=ids[Number(limit)-1]
      return {items,nextCursor:ids.length>Number(limit)?Buffer.from(JSON.stringify([scope,last.at,last.id])).toString('base64url'):null}
    },true)
  }

  async create(viewer: string, body: unknown) {
    if(!body||typeof body!=='object'||Array.isArray(body))throw invalid()
    const b=body as Record<string,unknown>
    if(Object.keys(b).some(k=>!['gangId','title','startsAt'].includes(k))||!uuid(b.gangId)||typeof b.title!=='string'||!iso(b.startsAt))throw invalid()
    const title=b.title.normalize('NFC').trim(), time=Date.parse(b.startsAt)
    if([...title].length<1||[...title].length>60||/[\u0000-\u001f\u007f]/.test(title)||time<=Date.now()||time>Date.now()+365*86400000)throw invalid()
    return this.transaction(async client=>{
      const member=await client.query('SELECT id FROM gang_members WHERE gang_id=$1 AND user_id=$2 AND left_at IS NULL FOR SHARE',[b.gangId,viewer])
      if(!member.rowCount)throw new ForbiddenException({error:{code:'FORBIDDEN'}})
      const id=randomUUID()
      await client.query('INSERT INTO meetups(id,gang_id,created_by,title,starts_at,created_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())',[id,b.gangId,viewer,title,b.startsAt])
      await client.query("INSERT INTO meetup_responses(id,meetup_id,user_id,response,answered_at) VALUES($1,$2,$3,'going',clock_timestamp())",[randomUUID(),id,viewer])
      const recipients=await client.query<{user_id:string}>('SELECT user_id FROM gang_members WHERE gang_id=$1 AND left_at IS NULL AND user_id<>$2',[b.gangId,viewer])
      for(const recipient of recipients.rows)await client.query("INSERT INTO app_notifications(id,user_id,actor_id,kind,meetup_id) VALUES($1,$2,$3,'meetup_invite',$4)",[randomUUID(),recipient.user_id,viewer,id])
      return this.project(client,viewer,await this.row(client,viewer,id),true)
    })
  }

  async respond(viewer: string,id: string,body: unknown,clear=false) {
    if(!body||typeof body!=='object'||Array.isArray(body))throw invalid()
    const b=body as Record<string,unknown>
    if(Object.keys(b).some(k=>!(clear?['scheduleVersion']:['scheduleVersion','response']).includes(k))||!Number.isInteger(b.scheduleVersion)||Number(b.scheduleVersion)<1
      ||(!clear&&(typeof b.response!=='string'||!['going','maybe','not_going'].includes(b.response))))throw invalid()
    return this.transaction(async client=>{
      const row=await this.row(client,viewer,id,true)
      if(row.scheduleVersion!==b.scheduleVersion)throw new ConflictException({error:{code:'MEETUP_VERSION_CONFLICT'}})
      if(Date.now()>=row.startsAt.getTime()+600000)throw new ConflictException({error:{code:'RESPONSE_LOCKED'}})
      await client.query(`INSERT INTO meetup_responses(id,meetup_id,user_id,response,confirmed_schedule_version,answered_at)
        VALUES($1,$2,$3,$4,$5,clock_timestamp()) ON CONFLICT(meetup_id,user_id) DO UPDATE SET response=EXCLUDED.response,
        confirmed_schedule_version=EXCLUDED.confirmed_schedule_version,answered_at=EXCLUDED.answered_at,hidden_at=NULL`,[randomUUID(),id,viewer,clear?null:b.response,b.scheduleVersion])
      return this.project(client,viewer,await this.row(client,viewer,id),true)
    })
  }

  async visibility(viewer: string,id: string,body: unknown) {
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!('hidden' in body)||typeof body.hidden!=='boolean')throw invalid()
    return this.transaction(async client=>{
      const row=await this.row(client,viewer,id,true)
      if(body.hidden&&row.createdBy.userId===viewer)throw new ConflictException({error:{code:'CREATOR_CANNOT_HIDE'}})
      await client.query(`INSERT INTO meetup_responses(id,meetup_id,user_id,hidden_at) VALUES($1,$2,$3,CASE WHEN $4 THEN clock_timestamp() END)
        ON CONFLICT(meetup_id,user_id) DO UPDATE SET hidden_at=EXCLUDED.hidden_at`,[randomUUID(),id,viewer,body.hidden])
      return this.project(client,viewer,await this.row(client,viewer,id),true)
    })
  }
}
