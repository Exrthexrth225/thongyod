import 'reflect-metadata'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomBytes,randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {NestFactory} from '@nestjs/core'
import {AppModule} from '../dist/app.module.js'
import {databaseConfig,assertLocalDatabase} from '../dist/db/config.js'
import {migrateDatabase} from '../dist/db/migrate.js'
import {sessionHash} from '../dist/auth/cookie.js'

test('meetups protect membership, hidden responses, versions and profile projections',{skip:!process.env.PGPASSWORD?'Configure separate test database':false},async()=>{
  const previous=process.env.PGDATABASE;process.env.PGDATABASE=process.env.TEST_PGDATABASE
  const config=databaseConfig();assertLocalDatabase(config,'thongyod_test');const pool=new Pool(config)
  const ids=Array.from({length:3},()=>randomUUID()),tokens=ids.map(()=>randomBytes(32).toString('base64url')),gang=randomUUID()
  let app
  try{
    await migrateDatabase(pool)
    for(let i=0;i<ids.length;i++){
      await pool.query("INSERT INTO users(id,display_name,display_name_key,handle,bio,birth_date,gender) VALUES($1,$2,$3,$4,'private bio','2000-01-01','other')",[ids[i],`Meet_${i}`,`meet_${i}`,`meet_${ids[i].slice(0,8)}`])
      await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')",[randomUUID(),ids[i],sessionHash(tokens[i])])
    }
    await pool.query('INSERT INTO gangs(id,created_by,created_at) VALUES($1,$2,now())',[gang,ids[0]])
    await pool.query("INSERT INTO gang_settings(gang_id,name,updated_at) VALUES($1,'Meet_Gang',now())",[gang])
    for(const id of ids.slice(0,2))await pool.query('INSERT INTO gang_members(id,gang_id,user_id,joined_at) VALUES($1,$2,$3,now())',[randomUUID(),gang,id])
    app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');const url=await app.getUrl()
    const call=(path,method='GET',actor=0,body,origin='http://localhost:5173')=>fetch(url+path,{method,headers:{Origin:origin,...(actor<0?{}:{Cookie:`thongyod_session=${tokens[actor]}`}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
    const json=async(path,actor=0)=>{const r=await call(path,'GET',actor);assert.equal(r.status,200,await r.clone().text());return r.json()}
    const createBody={gangId:gang,title:' นัดใหม่ ',startsAt:new Date(Date.now()+86400000).toISOString()}
    assert.equal((await call('/meetups','POST',-1,createBody)).status,401)
    assert.equal((await call('/meetups','POST',2,createBody)).status,403)
    assert.equal((await call('/meetups','POST',0,createBody,'https://evil.example')).status,403)
    assert.equal((await call('/meetups','POST',0,{...createBody,title:'x'.repeat(61)})).status,400)
    assert.equal((await call('/meetups','POST',0,{...createBody,minPeople:2})).status,400)
    const made=await call('/meetups','POST',0,createBody);assert.equal(made.status,201)
    const meetup=await made.json(),path='/meetups/'+meetup.id
    const notifications=await json('/notifications',1)
    assert.equal(notifications.unreadCount,1);assert.equal(notifications.items[0].target.id,meetup.id)
    assert.equal((await call('/notifications/read','POST',0,{ids:[notifications.items[0].id]})).status,204)
    assert.equal((await json('/notifications',1)).unreadCount,1)
    assert.equal((await call('/notifications/read','POST',1,{ids:[notifications.items[0].id]})).status,204)
    assert.equal((await json('/notifications',1)).unreadCount,0)
    assert.equal((await json('/home',1)).feed.length,1)
    assert.equal(meetup.counts.going,1);assert.equal(meetup.myResponse,'going');assert.equal(meetup.title,'นัดใหม่')
    assert.equal((await call(path,'GET',2)).status,404)
    assert.equal((await call(path+'/response','PUT',1,{response:'going',scheduleVersion:2})).status,409)
    assert.equal((await call(path+'/response','PUT',1,{response:'going',scheduleVersion:1})).status,200)
    assert.equal((await json(path)).counts.going,2)
    assert.equal((await call(path+'/visibility','PUT',0,{hidden:true})).status,409)
    assert.equal((await call(path+'/visibility','PUT',1,{hidden:true})).status,200)
    const hidden=await json(path,1),visible=await json(path)
    assert.equal(hidden.myState.hidden,true);assert.equal(hidden.myResponse,null);assert.equal(hidden.counts.going,1)
    assert.equal(visible.members.some(p=>p.userId===ids[1]),false);assert.equal(JSON.stringify(visible).includes('hidden_at'),false)
    assert.equal((await json('/home',1)).feed.length,0);assert.equal((await json('/notifications',1)).items.length,0)
    const from=new Date(Date.now()).toISOString(),to=new Date(Date.now()+3*86400000).toISOString(),query=`?from=${from}&to=${to}`
    assert.equal((await json('/meetups'+query,1)).items.length,0)
    assert.equal((await json('/meetups'+query+'&visibility=hidden',1)).items.length,1)
    assert.equal((await call('/meetups?from=bad&to=bad')).status,400)
    // PostgreSQL microseconds must survive a cursor boundary.
    const secondId=randomUUID()
    await pool.query("INSERT INTO meetups(id,gang_id,created_by,title,starts_at,created_at) VALUES($1,$2,$3,'Second',date_trunc('second',now())+interval '2 days 0.123456 seconds',now())",[secondId,gang,ids[0]])
    const page=await json('/meetups'+query+'&limit=1'),next=await json('/meetups'+query+'&limit=1&cursor='+page.nextCursor)
    assert.equal(next.items.length,1);assert.notEqual(page.items[0].id,next.items[0].id);assert.equal(next.nextCursor,null)
    assert.equal((await call('/meetups'+query+'&visibility=all&cursor='+page.nextCursor)).status,400)
    const stranger=await json(`/users/${ids[0]}/profile`,2)
    assert.equal(stranger.bio,null);assert.equal(stranger.titles,null);assert.equal(stranger.upcomingTogether,null);assert.deepEqual(stranger.sharedGangs,[])
    assert.ok(!Object.hasOwn(stranger,'birthDate'));assert.ok(!Object.hasOwn(stranger,'gender'))
    await pool.query("INSERT INTO friendships(id,requester_id,recipient_id,status,created_at,responded_at) VALUES($1,$2,$3,'accepted',now(),now())",[randomUUID(),ids[0],ids[1]])
    const friend=await json(`/users/${ids[0]}/profile`,1)
    assert.equal(friend.bio,'private bio');assert.equal(friend.stats,null);assert.deepEqual(friend.titles,[]);assert.equal(friend.sharedGangs.length,1);assert.equal(friend.upcomingTogether.length,0)
    await call(path+'/visibility','PUT',1,{hidden:false})
    assert.equal((await json(`/users/${ids[0]}/profile`,1)).upcomingTogether.length,1)
    assert.equal((await json(`/gangs/${gang}`,1)).members.length,2);assert.equal((await call(`/gangs/${gang}`,'GET',2)).status,404)
    await call('/blocks','POST',1,{userId:ids[0]})
    assert.equal((await call(`/users/${ids[0]}/profile`,'GET',1)).status,404)
    assert.equal((await json(`/gangs/${gang}`,1)).members.length,2)
    await pool.query("UPDATE meetups SET starts_at=now()-interval '11 minutes' WHERE id=$1",[meetup.id])
    assert.equal((await call(path+'/response','PUT',1,{response:'maybe',scheduleVersion:1})).status,409)
    await pool.query("UPDATE meetups SET starts_at=now()+interval '1 day' WHERE id=$1",[meetup.id])
    assert.equal((await call(path+'/response?scheduleVersion=1','DELETE',1)).status,200)
    assert.equal((await json(path,1)).myResponse,null)
    await call(path+'/response','PUT',1,{response:'maybe',scheduleVersion:1})
    await pool.query('UPDATE gang_members SET left_at=now() WHERE gang_id=$1 AND user_id=$2',[gang,ids[1]])
    assert.equal((await call(path,'GET',1)).status,404)
    assert.equal((await json(path)).counts.maybe,1)
  }finally{
    await app?.close()
    await pool.query('DELETE FROM app_notifications WHERE user_id=ANY($1::uuid[]) OR actor_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM meetup_responses WHERE meetup_id IN(SELECT id FROM meetups WHERE gang_id=$1)',[gang]);await pool.query('DELETE FROM meetups WHERE gang_id=$1',[gang])
    for(const t of ['gang_members','gang_settings'])await pool.query(`DELETE FROM ${t} WHERE gang_id=$1`,[gang]);await pool.query('DELETE FROM gangs WHERE id=$1',[gang])
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM user_blocks WHERE blocker_id=ANY($1::uuid[]) OR blocked_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM friendships WHERE requester_id=ANY($1::uuid[]) OR recipient_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end()
    if(previous===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=previous
  }
})
