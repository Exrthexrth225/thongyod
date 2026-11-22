import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../dist/app.module.js'
import { databaseConfig, assertLocalDatabase } from '../dist/db/config.js'
import { migrateDatabase } from '../dist/db/migrate.js'
import { sessionHash } from '../dist/auth/cookie.js'

test('social reads enforce session, privacy, exact handles and stable scoped pagination', {
  skip: !process.env.PGPASSWORD ? 'Configure the separate local test database first' : false,
}, async () => {
  const previous = process.env.PGDATABASE
  process.env.PGDATABASE = process.env.TEST_PGDATABASE
  const config = databaseConfig()
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  const ids = Array.from({ length: 6 }, () => randomUUID())
  const gangs = [randomUUID(), randomUUID(), randomUUID()]
  const handles = ids.map(id => `social_${id.slice(0,8)}`)
  const token = randomBytes(32).toString('base64url')
  let app
  try {
    await migrateDatabase(pool)
    for (let i=0; i<ids.length; i++) {
      const name = i === 1 || i === 2 ? 'Same_Name' : `Social_${i}`
      await pool.query('INSERT INTO users(id,display_name,display_name_key,handle,bio) VALUES($1,$2,$3,$4,$5)', [ids[i],name,name.toLowerCase(),handles[i],'Private bio'])
    }
    for (const [a,b,status] of [[0,1,'accepted'],[0,2,'accepted'],[1,2,'accepted'],[0,3,'accepted'],[4,5,'accepted'],[0,4,'pending'],[5,0,'pending']]) {
      await pool.query('INSERT INTO friendships(id,requester_id,recipient_id,status,created_at) VALUES($1,$2,$3,$4,now())', [randomUUID(),ids[a],ids[b],status])
    }
    await pool.query('INSERT INTO user_blocks(blocker_id,blocked_id,created_at) VALUES($1,$2,now())', [ids[3],ids[0]])
    for (let i=0;i<gangs.length;i++) {
      await pool.query('INSERT INTO gangs(id,created_by,created_at) VALUES($1,$2,now())', [gangs[i],ids[0]])
      await pool.query("INSERT INTO gang_settings(gang_id,name,updated_at) VALUES($1,'Same_Gang',now())", [gangs[i]])
      await pool.query('INSERT INTO gang_members(id,gang_id,user_id,joined_at,left_at) VALUES($1,$2,$3,now()-interval \'1 day\',$4)', [randomUUID(),gangs[i],ids[0],i===2?new Date():null])
    }
    await pool.query('INSERT INTO gang_members(id,gang_id,user_id,joined_at) VALUES($1,$2,$3,now())', [randomUUID(),gangs[0],ids[3]])
    await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')", [randomUUID(),ids[0],sessionHash(token)])
    app = await NestFactory.create(AppModule, { logger: false })
    await app.listen(0,'127.0.0.1')
    const url = await app.getUrl()
    const get = path => fetch(url+path,{headers:{Cookie:`thongyod_session=${token}`}})
    const json = async path => { const r=await get(path);assert.equal(r.status,200,path);return r.json() }
    for (const path of ['/friends','/friends/requests','/users/search?handle='+handles[1],'/users/'+ids[1]+'/mutual-friends','/gangs']) {
      assert.equal((await fetch(url+path,{headers:{'X-User-Id':ids[0]}})).status,401)
      assert.equal((await get(path)).headers.get('cache-control'),'no-store')
    }
    const first=await json('/friends?limit=1')
    const second=await json('/friends?limit=1&cursor='+first.nextCursor)
    assert.equal(second.nextCursor,null)
    assert.deepEqual([...first.items,...second.items].map(x=>x.userId),[ids[1],ids[2]].sort())
    assert.deepEqual(Object.keys(first.items[0]).sort(),['avatarUrl','displayName','handle','title','userId'])
    assert.equal((await json('/friends?q='+encodeURIComponent(handles[1].toUpperCase()))).items[0].userId,ids[1])
    assert.equal((await json('/friends?q=%25')).items.length,0)
    assert.equal((await get('/gangs?cursor='+first.nextCursor)).status,400)
    assert.equal((await get('/friends?q=changed&cursor='+first.nextCursor)).status,400)
    for(const query of ['limit=0','limit=51','limit=1&limit=2','limit=1e1','cursor=garbage','q=a&q=b']) assert.equal((await get('/friends?'+query)).status,400)
    const found=await json('/users/search?handle='+encodeURIComponent('@'+handles[1].toUpperCase()))
    assert.equal(found.relationship,'friend');assert.equal(found.mutualFriends,1);assert.equal(found.requestId,null)
    assert.equal((await json('/users/search?handle='+handles[0])).relationship,'self')
    assert.equal((await get('/users/search?handle=Same_Name')).status,404)
    assert.equal((await get('/users/search?handle='+handles[3])).status,404)
    assert.equal((await get('/users/'+ids[3]+'/mutual-friends')).status,404)
    assert.equal((await get('/users/invalid/mutual-friends')).status,404)
    assert.deepEqual((await json('/users/'+ids[1]+'/mutual-friends')).items.map(x=>x.userId),[ids[2]])
    const requests=await json('/friends/requests')
    assert.deepEqual(requests.incoming.map(r=>r.user.userId),[ids[5]])
    assert.deepEqual(requests.outgoing.map(r=>r.user.userId),[ids[4]])
    assert.equal((await json('/users/search?handle='+handles[4])).relationship,'request_sent')
    assert.equal((await json('/users/search?handle='+handles[5])).relationship,'request_received')
    const g1=await json('/gangs?limit=1')
    const g2=await json('/gangs?limit=1&cursor='+g1.nextCursor)
    assert.equal(g2.nextCursor,null)
    const allGangs=[...g1.items,...g2.items]
    assert.deepEqual(allGangs.map(g=>g.id),gangs.slice(0,2).sort())
    assert.equal(allGangs.find(g=>g.id===gangs[0]).memberCount,2)
    assert.equal((await json('/gangs?q=missing')).items.length,0)
  } finally {
    await app?.close()
    await pool.query('DELETE FROM gang_members WHERE gang_id=ANY($1::uuid[])',[gangs])
    await pool.query('DELETE FROM gang_settings WHERE gang_id=ANY($1::uuid[])',[gangs])
    await pool.query('DELETE FROM gangs WHERE id=ANY($1::uuid[])',[gangs])
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM user_blocks WHERE blocker_id=ANY($1::uuid[]) OR blocked_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM friendships WHERE requester_id=ANY($1::uuid[]) OR recipient_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids])
    await pool.end()
    if(previous===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=previous
  }
})

test('friend mutations enforce ownership, serialize with blocks and preserve shared memberships', {
  skip: !process.env.PGPASSWORD ? 'Configure the separate local test database first' : false,
}, async () => {
  const previous = process.env.PGDATABASE
  process.env.PGDATABASE = process.env.TEST_PGDATABASE
  const config = databaseConfig()
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  const ids = [randomUUID(),randomUUID(),randomUUID()]
  const handles = ids.map(id => `action_${id.slice(0,8)}`)
  const tokens = ids.map(() => randomBytes(32).toString('base64url'))
  const gang = randomUUID()
  const origin = 'http://localhost:5173'
  let app
  try {
    await migrateDatabase(pool)
    for (let i=0;i<ids.length;i++) {
      await pool.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,$3,$4)',[ids[i],`Action_${i}`,`action_${i}`,handles[i]])
      await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')",[randomUUID(),ids[i],sessionHash(tokens[i])])
    }
    await pool.query('INSERT INTO gangs(id,created_by,created_at) VALUES($1,$2,now())',[gang,ids[0]])
    await pool.query("INSERT INTO gang_settings(gang_id,name,updated_at) VALUES($1,'Action_Gang',now())",[gang])
    for(const id of ids) await pool.query('INSERT INTO gang_members(id,gang_id,user_id,joined_at) VALUES($1,$2,$3,now())',[randomUUID(),gang,id])
    const memberships=(await pool.query('SELECT * FROM gang_members WHERE gang_id=$1 ORDER BY id',[gang])).rows
    app=await NestFactory.create(AppModule,{logger:false})
    await app.listen(0,'127.0.0.1')
    const url=await app.getUrl()
    const call=(path,method='GET',actor=0,body,headers={})=>fetch(url+path,{method,headers:{Origin:origin,
      ...(actor<0?{}:{Cookie:`thongyod_session=${tokens[actor]}`}),
      ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})
    const reset=async(status='pending',sender=0,recipient=1)=>{
      await pool.query('DELETE FROM friendships WHERE requester_id=ANY($1::uuid[]) OR recipient_id=ANY($1::uuid[])',[ids])
      const id=randomUUID()
      await pool.query("INSERT INTO friendships(id,requester_id,recipient_id,status,created_at,responded_at) VALUES($1,$2,$3,$4,'2026-01-01T00:00:00Z',$5)",[id,ids[sender],ids[recipient],status,status==='accepted'?new Date('2026-01-02T00:00:00Z'):null])
      return id
    }
    const state=async id=>(await pool.query('SELECT status,created_at,responded_at FROM friendships WHERE id=$1',[id])).rows[0]
    const empty=async response=>{assert.equal(response.status,204);assert.equal(await response.text(),'');assert.equal(response.headers.get('cache-control'),'no-store')}
    const requests=async actor=>(await call('/friends/requests','GET',actor)).json()
    const search=actor=>call('/users/search?handle='+handles[1-actor],'GET',actor)
    let id=await reset()
    for(const [path,method,body] of [[`/friends/requests/${id}/accept`,'POST'],[`/friends/requests/${id}`,'DELETE'],[`/friends/${ids[1]}`,'DELETE'],['/blocks','POST',{userId:ids[1]}],[`/blocks/${ids[1]}`,'DELETE']]) {
      assert.equal((await call(path,method,-1,body)).status,401)
      assert.equal((await call(path,method,0,body,{Origin:'https://evil.example'})).status,403)
      assert.equal((await call(path,method,0,body,{Origin:''})).status,403)
    }
    for(const body of [{},{userId:123},{userId:ids[1],actorId:ids[0]},[]]) assert.equal((await call('/blocks','POST',0,body)).status,400)
    assert.equal((await call('/blocks','POST',0,{userId:ids[1]},{'Content-Type':'text/plain'})).status,400)
    for(const target of [ids[0],ids[0].toUpperCase(),randomUUID(),'invalid']) assert.equal((await call('/blocks','POST',0,{userId:target})).status,404)
    assert.equal((await call(`/friends/requests/${id}/accept`,'POST',0)).status,404)
    assert.equal((await call(`/friends/requests/${id}/accept`,'POST',2,undefined,{'X-User-Id':ids[1]})).status,404)
    assert.equal((await call(`/friends/requests/${id}`,'DELETE',2)).status,404)
    assert.equal((await call('/friends/requests/invalid/accept','POST',1)).status,404)
    assert.equal((await state(id)).status,'pending')
    await empty(await call(`/friends/requests/${id}/accept`,'POST',1))
    assert.equal((await state(id)).status,'accepted')
    assert.equal((await (await search(0)).json()).relationship,'friend')
    assert.equal((await call(`/friends/requests/${id}/accept`,'POST',1)).status,404)
    const accepted=await state(id)
    await empty(await call(`/friends/${ids[0]}`,'DELETE',1))
    assert.deepEqual(await state(id),{...accepted,status:'ended'})
    assert.equal((await call(`/friends/${ids[1]}`,'DELETE',0)).status,404)
    assert.equal((await (await search(0)).json()).relationship,'none')

    id=await reset()
    await empty(await call(`/friends/requests/${id}`,'DELETE',0))
    assert.equal((await state(id)).status,'ended');assert.deepEqual((await requests(0)).outgoing,[])
    const stale=id
    id=await reset()
    assert.equal((await call(`/friends/requests/${stale}/accept`,'POST',1)).status,404)
    await empty(await call(`/friends/requests/${id}`,'DELETE',1))
    assert.equal((await state(id)).status,'declined');assert.deepEqual((await requests(1)).incoming,[])

    id=await reset('accepted')
    await empty(await call('/blocks','POST',0,{userId:ids[1]}))
    await empty(await call('/blocks','POST',0,{userId:ids[1]}))
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM user_blocks WHERE blocker_id=$1',[ids[0]])).rows[0].n,1)
    assert.equal((await state(id)).status,'ended')
    assert.equal((await search(0)).status,404);assert.equal((await search(1)).status,404)
    await empty(await call('/blocks','POST',1,{userId:ids[0]}))
    await empty(await call(`/blocks/${ids[1]}`,'DELETE',0))
    await empty(await call(`/blocks/${ids[1]}`,'DELETE',0))
    assert.equal((await search(0)).status,404)
    await empty(await call(`/blocks/${ids[0]}`,'DELETE',1))
    assert.equal((await (await search(0)).json()).relationship,'none')
    for(const [sender,recipient] of [[0,1],[1,0]]) {
      id=await reset('pending',sender,recipient)
      await empty(await call('/blocks','POST',0,{userId:ids[1]}))
      assert.equal((await state(id)).status,'ended')
      assert.deepEqual(await requests(0),{incoming:[],outgoing:[]})
      assert.equal((await call(`/friends/requests/${id}/accept`,'POST',recipient)).status,404)
      await empty(await call(`/blocks/${ids[1]}`,'DELETE',0))
    }
    id=await reset()
    const doubleAccept=await Promise.all([call(`/friends/requests/${id}/accept`,'POST',1),call(`/friends/requests/${id}/accept`,'POST',1)])
    assert.deepEqual(doubleAccept.map(r=>r.status).sort(),[204,404]);assert.equal((await state(id)).status,'accepted')
    id=await reset()
    const acceptCancel=await Promise.all([call(`/friends/requests/${id}/accept`,'POST',1),call(`/friends/requests/${id}`,'DELETE',0)])
    assert.deepEqual(acceptCancel.map(r=>r.status).sort(),[204,404]);assert.ok(['accepted','ended'].includes((await state(id)).status))
    id=await reset()
    const blockAccept=await Promise.all([call('/blocks','POST',0,{userId:ids[1]}),call(`/friends/requests/${id}/accept`,'POST',1)])
    assert.equal(blockAccept[0].status,204);assert.ok([204,404].includes(blockAccept[1].status))
    assert.equal((await state(id)).status,'ended');assert.equal((await search(0)).status,404)
    await empty(await call(`/blocks/${ids[1]}`,'DELETE',0))
    const bothBlock=await Promise.all([call('/blocks','POST',0,{userId:ids[1]}),call('/blocks','POST',1,{userId:ids[0]})])
    assert.deepEqual(bothBlock.map(r=>r.status),[204,204])
    const bothUnblock=await Promise.all([call(`/blocks/${ids[1]}`,'DELETE',0),call(`/blocks/${ids[0]}`,'DELETE',1)])
    assert.deepEqual(bothUnblock.map(r=>r.status),[204,204])
    assert.deepEqual((await pool.query('SELECT * FROM gang_members WHERE gang_id=$1 ORDER BY id',[gang])).rows,memberships)
    assert.equal((await (await call('/gangs')).json()).items.find(g=>g.id===gang).memberCount,3)
  } finally {
    await app?.close()
    await pool.query('DELETE FROM gang_members WHERE gang_id=$1',[gang])
    await pool.query('DELETE FROM gang_settings WHERE gang_id=$1',[gang])
    await pool.query('DELETE FROM gangs WHERE id=$1',[gang])
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM user_blocks WHERE blocker_id=ANY($1::uuid[]) OR blocked_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM friendships WHERE requester_id=ANY($1::uuid[]) OR recipient_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids])
    await pool.end()
    if(previous===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=previous
  }
})
