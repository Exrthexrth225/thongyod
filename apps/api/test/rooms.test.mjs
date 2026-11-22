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
test('shared game rooms enforce host, capacity, expiry, secret projection and anonymous results',{skip:!process.env.PGPASSWORD?'Configure separate test database':false},async()=>{
 const previous=process.env.PGDATABASE;process.env.PGDATABASE=process.env.TEST_PGDATABASE;const config=databaseConfig();assertLocalDatabase(config,'thongyod_test');const pool=new Pool(config)
 const ids=Array.from({length:14},()=>randomUUID()),tokens=ids.map(()=>randomBytes(32).toString('base64url')),codes=[];let app
 try{
  await migrateDatabase(pool)
  for(let i=0;i<ids.length;i++){
   await pool.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,$3,$4)',[ids[i],`Room_${i}`,`room_${i}`,`room_${ids[i].slice(0,8)}`])
   await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')",[randomUUID(),ids[i],sessionHash(tokens[i])])
  }
  app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');const url=await app.getUrl()
  const call=(path,method='GET',actor=0,body,origin='http://localhost:5173')=>fetch(url+path,{method,headers:{Origin:origin,...(actor<0?{}:{Cookie:`thongyod_session=${tokens[actor]}`}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const json=async(path,actor=0)=>{const r=await call(path,'GET',actor);assert.equal(r.status,200,await r.clone().text());return r.json()}
  const create=async game=>{const r=await call('/rooms','POST',0,{game,settings:{}});assert.equal(r.status,201);const room=await r.json();codes.push(room.code);return '/rooms/'+room.code}
  const spy=await create('spy')
  assert.equal((await call(spy,'GET',-1)).status,401)
  assert.equal((await call(spy+'/start','POST')).status,409)
  const joined=await Promise.all(Array.from({length:13},(_,i)=>call(spy+'/join','POST',i+1)))
  assert.equal(joined.filter(r=>r.status===200).length,11);assert.equal(joined.filter(r=>r.status===409).length,2)
  const lobby=await json(spy),actors=lobby.players.map(p=>ids.indexOf(p.userId)),outsider=ids.findIndex(id=>!lobby.players.some(p=>p.userId===id))
  assert.equal(lobby.players.length,12)
  assert.equal((await call(spy+'/start','POST',actors[1])).status,403)
  assert.equal((await call(spy+'/settings','PATCH',0,{spies:9})).status,400)
  assert.equal((await call(spy+'/start','POST',0,undefined,'https://evil.example')).status,403)
  assert.equal((await call(spy+'/start','POST')).status,200)
  const views=await Promise.all(actors.map(a=>json(spy,a)))
  assert.equal(views.filter(v=>v.mySecret.isSpy).length,1)
  assert.ok(views.every(v=>v.round.reveal===null&&!Object.hasOwn(v.round,'spies')))
  assert.equal(views.find(v=>v.mySecret.isSpy).mySecret.text,null)
  assert.equal((await json(spy,outsider)).mySecret,null)
  assert.equal((await call(spy+'/join','POST',outsider)).status,409)
  assert.equal((await call(spy+'/reveal','POST')).status,200)
  assert.equal((await json(spy)).round.reveal.spyIds.length,1)
  assert.equal((await json(spy,outsider)).round.reveal,null)
  await call(spy+'/leave','POST')
  const transferred=await json(spy,actors[1]);assert.equal(transferred.hostId,lobby.players[1].userId)
  assert.equal((await call(spy+'/lobby','POST',actors[1])).status,200)

  const party=await create('mostLikely');await call(party+'/join','POST',1);await call(party+'/join','POST',2)
  await pool.query("INSERT INTO friendships(id,requester_id,recipient_id,status,created_at) VALUES($1,$2,$3,'accepted',now())",[randomUUID(),ids[0],ids[3]])
  assert.equal((await call(party+'/invite','POST',0,{userIds:[ids[3],ids[4]]})).status,204)
  const invites=await json('/notifications',3);assert.equal(invites.items[0].target.id,party.slice(7));assert.equal((await json('/notifications',4)).items.length,0)
  assert.equal((await call(party+'/start','POST')).status,200)
  assert.equal((await call(party+'/vote','POST',3,{choice:ids[0]})).status,403)
  await call(party+'/vote','POST',0,{choice:ids[1]})
  const before=await json(party,1);assert.equal(before.round.myVote,null);assert.equal(before.round.result,null);assert.deepEqual(before.round.votedIds,[ids[0]]);assert.equal(Object.hasOwn(before.round,'votes'),false)
  await Promise.all([call(party+'/vote','POST',1,{choice:ids[1]}),call(party+'/vote','POST',2,{choice:ids[0]})])
  const scored=await json(party);assert.equal(scored.state,'revealed');assert.equal(scored.round.result.tally[ids[1]],2);assert.deepEqual(scored.round.result.haveIds,[])
  const card=scored.round.card;await call(party+'/start','POST');assert.notEqual((await json(party)).round.card,card)
  assert.equal((await call(party+'/vote','POST',0,{choice:ids[1],roundNumber:scored.round.number})).status,409)

  const never=await create('neverHave');await call(never+'/join','POST',1);await call(never+'/start','POST')
  await Promise.all([call(never+'/vote','POST',0,{choice:'have'}),call(never+'/vote','POST',1,{choice:'never'})])
  const fingers=await json(never);assert.equal(fingers.fingers[ids[0]],4);assert.equal(fingers.fingers[ids[1]],5)
  await Promise.all([call(never+'/reveal','POST'),call(never+'/reveal','POST')]);assert.equal((await json(never)).fingers[ids[0]],4)
  await call(never+'/lobby','POST');assert.equal((await json(never)).fingers,null)
  await call(never+'/leave','POST',1);await call(never+'/leave','POST');assert.equal((await call(never)).status,404)
  await pool.query("UPDATE game_rooms SET created_at=now()-interval '4 hours',expires_at=now()-interval '1 hour' WHERE code=$1",[party.slice(7)])
  assert.equal((await call(party)).status,404);assert.equal((await json('/notifications',3)).items.length,0)
 }finally{
  await app?.close();await pool.query('DELETE FROM game_rooms WHERE code=ANY($1::text[])',[codes]);await pool.query('DELETE FROM app_notifications WHERE user_id=ANY($1::uuid[]) OR actor_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM friendships WHERE requester_id=ANY($1::uuid[]) OR recipient_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();if(previous===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=previous
 }
})
