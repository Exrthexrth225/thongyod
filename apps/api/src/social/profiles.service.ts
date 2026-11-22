import { HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type {PoolClient} from 'pg'
import { DatabaseService } from '../db/database.service.js'
import { SocialService } from './social.service.js'
import { MeetupsService } from './meetups.service.js'

const uuid = (v:string)=>/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)
@Injectable()
export class ProfilesService {
  constructor(private readonly database:DatabaseService,private readonly social:SocialService,private readonly meetups:MeetupsService){}
  private async snapshot<T>(work:(client:PoolClient)=>Promise<T>){
    const client=await this.database.connection.connect().catch(()=>{throw new ServiceUnavailableException({error:{code:'SOCIAL_UNAVAILABLE'}})})
    try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const value=await work(client);await client.query('COMMIT');return value}
    catch(error){await client.query('ROLLBACK').catch(()=>undefined);if(error instanceof HttpException)throw error;throw new ServiceUnavailableException({error:{code:'SOCIAL_UNAVAILABLE'}})}finally{client.release()}
  }
  private async rows(sql:string,values:unknown[],client:PoolClient) {
    try{return (await client.query(sql,values)).rows}
    catch{throw new ServiceUnavailableException({error:{code:'SOCIAL_UNAVAILABLE'}})}
  }
  async profile(viewer:string,id:string) {
    return this.snapshot(client=>this.profileView(viewer,id,client))
  }
  private async profileView(viewer:string,id:string,client:PoolClient){
    const target=id==='me'?viewer:id
    if(!uuid(target))throw new NotFoundException({error:{code:'USER_NOT_FOUND'}})
    const users=await this.rows('SELECT handle FROM users WHERE id=$1',[target],client)
    if(!users[0])throw new NotFoundException({error:{code:'USER_NOT_FOUND'}})
    const card=await this.social.search(viewer,users[0].handle,client)
    const allowed=card.relationship==='friend'||card.relationship==='self'
    const data=(await this.rows(`SELECT u.cover_url AS "coverUrl",CASE WHEN $3 THEN u.bio ELSE NULL END AS bio,
      CASE WHEN $1::uuid<>$2::uuid AND $3::boolean THEN (SELECT f.responded_at FROM friendships f WHERE f.status='accepted' AND
      ((f.requester_id=$1 AND f.recipient_id=$2) OR (f.requester_id=$2 AND f.recipient_id=$1))) ELSE NULL END AS "friendsSince"
      FROM users u WHERE u.id=$2 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))`,[viewer,target,allowed],client))[0]
    if(!data)throw new NotFoundException({error:{code:'USER_NOT_FOUND'}})
    const sharedGangs=await this.rows(`SELECT s.gang_id AS id,s.name FROM gang_settings s
      JOIN gang_members a ON a.gang_id=s.gang_id AND a.user_id=$1 AND a.left_at IS NULL
      JOIN gang_members b ON b.gang_id=s.gang_id AND b.user_id=$2 AND b.left_at IS NULL ORDER BY s.name COLLATE "C",s.gang_id`,[viewer,target],client)
    const mutualPreview=viewer===target?[]:(await this.social.mutualFriends(viewer,target,{limit:'5'},client)).items
    const upcomingTogether=[]
    if(allowed&&viewer!==target){
      const ids=await this.rows(`SELECT m.id FROM meetups m
        JOIN gang_members a ON a.gang_id=m.gang_id AND a.user_id=$1 AND a.left_at IS NULL
        JOIN gang_members b ON b.gang_id=m.gang_id AND b.user_id=$2 AND b.left_at IS NULL
        JOIN meetup_responses r ON r.meetup_id=m.id AND r.user_id=$1 AND r.response='going' AND r.hidden_at IS NULL AND r.confirmed_schedule_version=m.schedule_version
        JOIN meetup_responses t ON t.meetup_id=m.id AND t.user_id=$2 AND t.response='going' AND t.hidden_at IS NULL AND t.confirmed_schedule_version=m.schedule_version
        WHERE m.starts_at>now() ORDER BY m.starts_at,m.id LIMIT 5`,[viewer,target],client)
      for(const item of ids){const {members,attendance,createdAt,minPeople,maxPeople,waitlistedCount,needsReconfirmCount,...summary}=await this.meetups.detail(viewer,item.id,client);upcomingTogether.push(summary)}
    }
    // Confirmed attendance/title/pet engines do not exist yet; never substitute answers or fixture snapshots.
    return {...card,...data,mutualPreview,sharedGangs:viewer===target?[]:sharedGangs,stats:null,titles:allowed?[]:null,pet:null,upcomingTogether:allowed&&viewer!==target?upcomingTogether:null}
  }
  async gang(viewer:string,id:string){
    return this.snapshot(client=>this.gangView(viewer,id,client))
  }
  private async gangView(viewer:string,id:string,client:PoolClient){
    if(!uuid(id))throw new NotFoundException({error:{code:'GANG_NOT_FOUND'}})
    const gang=(await this.rows(`SELECT s.gang_id AS id,s.name FROM gang_settings s JOIN gang_members mine ON mine.gang_id=s.gang_id
      AND mine.user_id=$1 AND mine.left_at IS NULL WHERE s.gang_id=$2`,[viewer,id],client))[0]
    if(!gang)throw new NotFoundException({error:{code:'GANG_NOT_FOUND'}})
    const members=await this.rows(`SELECT u.id AS "userId",u.display_name AS "displayName",u.handle,u.avatar_url AS "avatarUrl",u.main_title_key AS title
      FROM gang_members g JOIN users u ON u.id=g.user_id WHERE g.gang_id=$1 AND g.left_at IS NULL ORDER BY u.display_name COLLATE "C",u.id`,[id],client)
    const ids=await this.rows(`SELECT m.id FROM meetups m LEFT JOIN meetup_responses r ON r.meetup_id=m.id AND r.user_id=$1
      WHERE m.gang_id=$2 AND m.starts_at>now() AND r.hidden_at IS NULL ORDER BY m.starts_at,m.id LIMIT 5`,[viewer,id],client)
    const upcoming=[]
    for(const item of ids){const {members,attendance,createdAt,minPeople,maxPeople,waitlistedCount,needsReconfirmCount,...summary}=await this.meetups.detail(viewer,item.id,client);upcoming.push(summary)}
    return {...gang,memberCount:members.length,members,upcoming,titles:[]}
  }
}
