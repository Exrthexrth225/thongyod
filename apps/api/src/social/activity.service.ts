import {BadRequestException,HttpException,Injectable,ServiceUnavailableException} from '@nestjs/common'
import {DatabaseService} from '../db/database.service.js'
import type {PoolClient} from 'pg'

// Notifications remain visible only while the viewer can access their actor and target.
const source=`FROM app_notifications n JOIN users u ON u.id=n.actor_id
  LEFT JOIN friendships f ON f.id=n.friend_request_id
  LEFT JOIN meetups m ON m.id=n.meetup_id LEFT JOIN gang_settings s ON s.gang_id=m.gang_id
  LEFT JOIN game_rooms room ON room.code=n.room_code
  WHERE n.user_id=$1 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
    (b.blocker_id=$1 AND b.blocked_id=n.actor_id) OR (b.blocked_id=$1 AND b.blocker_id=n.actor_id))
  AND ((n.kind='friend_request' AND f.status='pending' AND f.recipient_id=$1)
    OR (n.kind='friend_accepted' AND f.status='accepted' AND f.requester_id=$1)
    OR (n.kind='meetup_invite' AND EXISTS(SELECT 1 FROM gang_members g WHERE g.gang_id=m.gang_id AND g.user_id=$1 AND g.left_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM meetup_responses r WHERE r.meetup_id=m.id AND r.user_id=$1 AND r.hidden_at IS NOT NULL))
    OR (n.kind='game_invite' AND room.expires_at>now() AND room.data->'playerIds' ? n.actor_id::text))`
const invalid=()=>new BadRequestException({error:{code:'INVALID_REQUEST'}})
@Injectable()
export class ActivityService{
  constructor(private readonly database:DatabaseService){}
  private async transaction<T>(work:(c:PoolClient)=>Promise<T>,readOnly=false){
    const c=await this.database.connection.connect().catch(()=>{throw new ServiceUnavailableException({error:{code:'ACTIVITY_UNAVAILABLE'}})})
    try{await c.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');const r=await work(c);await c.query('COMMIT');return r}
    catch(e){await c.query('ROLLBACK').catch(()=>undefined);if(e instanceof HttpException)throw e;throw new ServiceUnavailableException({error:{code:'ACTIVITY_UNAVAILABLE'}})}finally{c.release()}
  }
  async home(viewer:string){return this.transaction(async c=>{
    const feed=(await c.query(`SELECT m.id,'meetup_created' AS kind,u.display_name AS "actorName",m.title AS subject,s.name AS "gangName",m.created_at AS "createdAt"
      FROM meetups m JOIN users u ON u.id=m.created_by JOIN gang_settings s ON s.gang_id=m.gang_id
      JOIN gang_members g ON g.gang_id=m.gang_id AND g.user_id=$1 AND g.left_at IS NULL AND g.joined_at<=m.created_at
      WHERE NOT EXISTS(SELECT 1 FROM meetup_responses r WHERE r.meetup_id=m.id AND r.user_id=$1 AND r.hidden_at IS NOT NULL)
      ORDER BY m.created_at DESC,m.id DESC LIMIT 20`,[viewer])).rows
    return {pending:[],pet:null,luckyColor:null,feed}
  },true)}
  async list(viewer:string,query:Record<string,unknown>){
    const {limit='20',cursor}=query
    if(typeof limit!=='string'||!/^\d+$/.test(limit)||Number(limit)<1||Number(limit)>50)throw invalid()
    let at:string|null=null,id:string|null=null
    if(cursor!==undefined)try{
      if(typeof cursor!=='string'||cursor.length>2048||!/^[A-Za-z0-9_-]+$/.test(cursor))throw invalid()
      const data=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!Array.isArray(data)||data.length!==3||data[0]!==viewer||typeof data[1]!=='string'||!Number.isFinite(Date.parse(data[1]))||typeof data[2]!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data[2]))throw invalid()
      at=data[1];id=data[2]
    }catch{throw invalid()}
    return this.transaction(async c=>{
      const rows=(await c.query(`SELECT n.id,n.kind,n.created_at AS "createdAt",n.read_at AS "readAt",
        json_build_object('userId',u.id,'displayName',u.display_name,'avatarUrl',u.avatar_url) AS actor,s.name AS "gangName",m.title AS subject,m.starts_at AS "startsAt",NULL AS "amountSatang",
        CASE WHEN n.kind='friend_request' THEN json_build_object('type','friend_requests') WHEN n.kind='friend_accepted' THEN json_build_object('type','user','id',n.actor_id)
          WHEN n.kind='game_invite' THEN json_build_object('type','room','id',n.room_code)
          ELSE json_build_object('type','meetup','id',m.id) END AS target,
        to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS position
        ${source} AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2::timestamptz,$3::uuid)) ORDER BY n.created_at DESC,n.id DESC LIMIT $4`,[viewer,at,id,Number(limit)+1])).rows
      const unreadCount=(await c.query(`SELECT count(*)::int n ${source} AND n.read_at IS NULL`,[viewer])).rows[0].n
      const last=rows[Number(limit)-1]
      return {items:rows.slice(0,Number(limit)).map(({position,...item})=>item),unreadCount,nextCursor:rows.length>Number(limit)?Buffer.from(JSON.stringify([viewer,last.position,last.id])).toString('base64url'):null}
    },true)
  }
  async read(viewer:string,body:unknown){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='ids'))throw invalid()
    const ids=(body as {ids?:unknown}).ids
    if(ids!==undefined&&(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))))throw invalid()
    return this.transaction(async c=>{await c.query('UPDATE app_notifications SET read_at=clock_timestamp() WHERE user_id=$1 AND read_at IS NULL AND ($2::uuid[] IS NULL OR id=ANY($2::uuid[]))',[viewer,ids??null])})
  }
}
