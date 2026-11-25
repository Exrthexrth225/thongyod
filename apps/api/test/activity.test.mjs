import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../dist/app.module.js'
import { databaseConfig, assertLocalDatabase } from '../dist/db/config.js'
import { migrateDatabase } from '../dist/db/migrate.js'
import { sessionHash } from '../dist/auth/cookie.js'

const local = { skip: !process.env.PGPASSWORD ? 'Configure the separate local test database first' : false }

test('activity migration preserves legacy rows, starts unread at rollout and remains repeatable', local, async () => {
  const config = databaseConfig({ ...process.env, PGDATABASE: process.env.TEST_PGDATABASE })
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  const client = await pool.connect()
  try {
    await migrateDatabase(pool)
    const before = (await pool.query('SELECT * FROM activity_epoch')).rows
    await migrateDatabase(pool)
    assert.deepEqual((await pool.query('SELECT * FROM activity_epoch')).rows, before)
    await client.query('BEGIN')
    const namespace = 'activity_upgrade_' + randomUUID().replaceAll('-', '')
    await client.query(`CREATE SCHEMA "${namespace}"`)
    await client.query(`SET LOCAL search_path TO "${namespace}", public`)
    await client.query('CREATE TABLE gang_members(id uuid PRIMARY KEY)')
    await client.query('CREATE TABLE meetups(id uuid PRIMARY KEY,gang_id uuid,created_at timestamptz,title text)')
    const id = randomUUID()
    await client.query("INSERT INTO meetups VALUES($1,$2,'2001-01-01T00:00:00Z','Keep this history')", [id,randomUUID()])
    const sql = await readFile(new URL('../drizzle/0006_gang_activity.sql',import.meta.url),'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.query(statement.replaceAll('"public"."gang_members"',`"${namespace}"."gang_members"`))
    }
    const row = (await client.query('SELECT m.*,e.started_at FROM meetups m CROSS JOIN activity_epoch e')).rows[0]
    assert.equal(row.id,id)
    assert.equal(row.title,'Keep this history')
    assert.equal(row.created_at.toISOString(),'2001-01-01T00:00:00.000Z')
    assert.ok(row.created_at < row.started_at)
    assert.ok(BigInt(row.activity_txid)>0n)
  } finally {
    await client.query('ROLLBACK').catch(()=>undefined)
    client.release()
    await pool.end()
  }
})

test('gang unread and feed enforce snapshots, monotonic reads, membership and private activity', local, async () => {
  const previous = process.env.PGDATABASE
  process.env.PGDATABASE = process.env.TEST_PGDATABASE
  const config = databaseConfig()
  assertLocalDatabase(config,'thongyod_test')
  const pool = new Pool(config)
  const ids = Array.from({length:4},()=>randomUUID())
  const [viewer,peer,blocked,outsider] = ids
  const gangs = [randomUUID(),randomUUID(),randomUUID()]
  const membership = randomUUID(), tokens = ids.map(()=>randomBytes(32).toString('base64url'))
  let app, pending
  try {
    await migrateDatabase(pool)
    for (const [i,id] of ids.entries()) {
      const name = 'Activity_'+id.slice(0,8)
      await pool.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,$3,$3)',[id,name,name.toLowerCase()])
      await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')",[randomUUID(),id,sessionHash(tokens[i])])
    }
    for (const [i,gang] of gangs.entries()) {
      await pool.query('INSERT INTO gangs(id,created_by,created_at) VALUES($1,$2,now())',[gang,viewer])
      await pool.query('INSERT INTO gang_settings(gang_id,name,updated_at) VALUES($1,$2,now())',[gang,'Activity gang '+i])
      if (i<2) await pool.query("INSERT INTO gang_members(id,gang_id,user_id,joined_at) VALUES($1,$2,$3,now()-interval '3 days')",[i===0?membership:randomUUID(),gang,viewer])
      await pool.query("INSERT INTO gang_members(id,gang_id,user_id,joined_at) VALUES($1,$2,$3,now()-interval '3 days')",[randomUUID(),gang,peer])
    }
    const add = async (actor,{created=null,gang=gangs[0],title='New meetup',minutes=120}={},client=pool) => {
      const id=randomUUID()
      await client.query("INSERT INTO meetups(id,gang_id,created_by,title,starts_at,created_at) VALUES($1,$2,$3,$4,clock_timestamp()+$6*interval '1 minute',coalesce($5::timestamptz,clock_timestamp()))",[id,gang,actor,title,created,minutes])
      return id
    }
    const oldAt=new Date(Date.now()-2*86400000).toISOString()
    const legacy=await add(peer,{created:oldAt,title:'Existing history',minutes:60})
    const own=await add(viewer,{created:oldAt,minutes:240})
    const privateMeetup=await add(peer,{created:oldAt,minutes:1})
    await pool.query('INSERT INTO meetup_responses(id,meetup_id,user_id,hidden_at) VALUES($1,$2,$3,now())',[randomUUID(),privateMeetup,viewer])
    const blockedMeetup=await add(blocked,{created:oldAt,minutes:1})
    await pool.query('INSERT INTO user_blocks(blocker_id,blocked_id,created_at) VALUES($1,$2,now())',[blocked,viewer])
    await add(peer,{created:oldAt,gang:gangs[2]})
    app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1')
    const url=await app.getUrl()
    const call=(path,{method='GET',body,user=0,origin='http://localhost:5173',content='application/json'}={})=>fetch(url+path,{method,headers:{...(user>=0?{Cookie:`thongyod_session=${tokens[user]}`} : {}),...(method!=='GET'?{Origin:origin,'Content-Type':content}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
    const json=async(path,options)=>{const r=await call(path,options);assert.equal(r.status,200,path+' '+await r.clone().text());assert.equal(r.headers.get('cache-control'),'no-store');return r.json()}
    const gang=async id=>(await json('/gangs')).items.find(g=>g.id===id)
    let g=await gang(gangs[0]);assert.equal(g.unreadCount,0);assert.equal(g.lastOpenedAt,null);assert.equal(g.nextMeetup.id,legacy)
    assert.deepEqual(Object.keys(g).sort(),['id','lastOpenedAt','memberCount','name','nextMeetup','readCursor','unreadCount'])
    assert.equal((await gang(gangs[1])).nextMeetup,null)
    const oldFeed=await json('/feed');assert.deepEqual(oldFeed.items.map(m=>m.id),[legacy]);assert.equal(oldFeed.nextCursor,null)
    assert.deepEqual(oldFeed.items[0].target,{type:'meetup',id:legacy})
    assert.equal(oldFeed.items[0].gangId,gangs[0])
    for(const path of ['/feed','/gangs'])assert.equal((await call(path,{user:-1})).status,401)
    for(const q of ['limit=0','limit=51','limit=1&limit=2','limit=1e1','cursor=garbage','cursor=x&cursor=y','q=a'])assert.equal((await call('/feed?'+q)).status,400,q)
    const a=await add(peer)
    assert.equal((await gang(gangs[0])).unreadCount,1)
    const snapshotA=(await gang(gangs[0])).readCursor
    const b=await add(peer)
    await add(viewer)
    assert.equal((await gang(gangs[0])).unreadCount,2)
    const readPath='/gangs/'+gangs[0]+'/activity/read'
    const mark=cursor=>json(readPath,{method:'PUT',body:{readThrough:cursor}})
    const notificationsBefore=(await pool.query('SELECT count(*)::int n FROM app_notifications WHERE user_id=$1',[viewer])).rows[0].n
    const answerBefore=(await pool.query('SELECT * FROM meetup_responses WHERE user_id=$1',[viewer])).rows
    const readA=await mark(snapshotA)
    assert.ok(readA.lastOpenedAt);assert.equal((await gang(gangs[0])).unreadCount,1)
    const snapshotB=(await gang(gangs[0])).readCursor
    await mark(snapshotB);assert.equal((await gang(gangs[0])).unreadCount,0)
    await mark(snapshotA);assert.equal((await gang(gangs[0])).unreadCount,0)
    assert.equal((await pool.query('SELECT count(*)::int n FROM app_notifications WHERE user_id=$1',[viewer])).rows[0].n,notificationsBefore)
    assert.deepEqual((await pool.query('SELECT * FROM meetup_responses WHERE user_id=$1',[viewer])).rows,answerBefore)
    // An in-flight creation predates the snapshot clock but was not visible to its reader.
    pending=await pool.connect();await pending.query('BEGIN')
    const inFlight=await add(peer,{},pending)
    const whilePending=await gang(gangs[0]);assert.equal(whilePending.unreadCount,0)
    await pending.query('COMMIT');pending.release();pending=undefined
    await mark(whilePending.readCursor);assert.equal((await gang(gangs[0])).unreadCount,1)
    const readNow=(await gang(gangs[0])).readCursor;await mark(readNow)
    assert.equal((await gang(gangs[0])).unreadCount,0)
    // Updating a meetup must not change its creation marker or make it disappear from a feed snapshot.
    const creation=(await pool.query('SELECT activity_txid FROM meetups WHERE id=$1',[a])).rows[0].activity_txid
    await pool.query('UPDATE meetups SET schedule_version=schedule_version+1 WHERE id=$1',[a])
    assert.equal((await pool.query('SELECT activity_txid FROM meetups WHERE id=$1',[a])).rows[0].activity_txid,creation)
    const tied=(await pool.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS at")).rows[0].at
    const ties=[];for(let i=0;i<4;i++)ties.push(await add(peer,{created:tied}))
    const first=await json('/feed?limit=1');assert.ok(first.nextCursor)
    const insertedLater=await add(peer,{created:tied})
    const collected=[...first.items];let cursor=first.nextCursor
    while(cursor){const next=await json('/feed?limit=2&cursor='+encodeURIComponent(cursor));collected.push(...next.items);cursor=next.nextCursor}
    const expected=[legacy,a,b,inFlight,...ties]
    assert.deepEqual(new Set(collected.map(m=>m.id)),new Set(expected));assert.equal(collected.length,expected.length)
    assert.equal(collected.some(m=>m.id===insertedLater),false)
    assert.ok((await json('/feed')).items.some(m=>m.id===insertedLater))
    for(const id of [own,privateMeetup,blockedMeetup])assert.equal(collected.some(m=>m.id===id),false)
    assert.equal((await call('/feed?cursor='+encodeURIComponent(first.nextCursor),{user:1})).status,400)
    assert.equal((await call(readPath,{method:'PUT',user:1,body:{readThrough:readNow}})).status,400)
    assert.equal((await call(readPath,{method:'PUT',body:{readThrough:first.nextCursor}})).status,400)
    const changed=first.nextCursor.slice(0,-3)+'xyz';assert.equal((await call('/feed?cursor='+changed)).status,400)
    for(const options of [{user:-1},{user:3},{origin:'https://evil.example'},{content:'text/plain'}]) {
      const r=await call(readPath,{method:'PUT',body:{readThrough:readNow},...options})
      assert.equal(r.status,options.user===-1?401:options.user===3?404:options.origin?403:400)
    }
    for(const body of [{},{readThrough:'garbage'},{readThrough:readNow,extra:true},[]])assert.equal((await call(readPath,{method:'PUT',body})).status,400)
    assert.equal((await call(readPath,{method:'PUT',body:{readThrough:(await gang(gangs[1])).readCursor}})).status,400)
    assert.equal((await call('/gangs/'+gangs[2]+'/activity/read',{method:'PUT',body:{readThrough:readNow}})).status,404)
    // A block introduced after page 1 is enforced again on page 2, in either direction.
    const privacyPage=await json('/feed?limit=1')
    await pool.query('INSERT INTO user_blocks(blocker_id,blocked_id,created_at) VALUES($1,$2,now())',[viewer,peer])
    assert.equal((await json('/feed?cursor='+privacyPage.nextCursor)).items.length,0)
    assert.equal((await gang(gangs[0])).unreadCount,0)
    await pool.query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[viewer,peer])
    const staleMembership=(await gang(gangs[0])).readCursor
    await pool.query('UPDATE gang_members SET left_at=clock_timestamp() WHERE id=$1',[membership])
    assert.equal((await call(readPath,{method:'PUT',body:{readThrough:staleMembership}})).status,404)
    assert.equal((await json('/feed')).items.length,0)
    assert.equal((await json('/feed?cursor='+encodeURIComponent(first.nextCursor))).items.length,0)
    const rejoined=randomUUID()
    await pool.query('INSERT INTO gang_members(id,gang_id,user_id,joined_at) VALUES($1,$2,$3,clock_timestamp())',[rejoined,gangs[0],viewer])
    assert.equal((await gang(gangs[0])).unreadCount,0)
    assert.equal((await gang(gangs[0])).lastOpenedAt,null)
    assert.equal((await call(readPath,{method:'PUT',body:{readThrough:staleMembership}})).status,400)
    assert.equal((await json('/feed')).items.length,0)
    const afterRejoin=await add(peer);assert.equal((await gang(gangs[0])).unreadCount,1)
    assert.deepEqual((await json('/feed')).items.map(m=>m.id),[afterRejoin])
  } finally {
    if(pending){await pending.query('ROLLBACK').catch(()=>undefined);pending.release()}
    await app?.close()
    await pool.query('DELETE FROM app_notifications WHERE user_id=ANY($1::uuid[]) OR actor_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM meetup_responses WHERE meetup_id IN(SELECT id FROM meetups WHERE gang_id=ANY($1::uuid[]))',[gangs])
    await pool.query('DELETE FROM meetups WHERE gang_id=ANY($1::uuid[])',[gangs])
    await pool.query('DELETE FROM gang_members WHERE gang_id=ANY($1::uuid[])',[gangs])
    await pool.query('DELETE FROM gang_settings WHERE gang_id=ANY($1::uuid[])',[gangs])
    await pool.query('DELETE FROM gangs WHERE id=ANY($1::uuid[])',[gangs])
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM user_blocks WHERE blocker_id=ANY($1::uuid[]) OR blocked_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids])
    await pool.end()
    if(previous===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=previous
  }
})
