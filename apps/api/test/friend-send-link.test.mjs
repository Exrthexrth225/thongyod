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
import { encryptLink, decryptLink } from '../dist/social/link-token.js'

test('recoverable links authenticate ciphertext and require a valid key', () => {
  const previous = process.env.APP_ENCRYPTION_KEY
  try {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    const encrypted = encryptLink('secret', 'owner:link')
    assert.equal(decryptLink(encrypted, 'owner:link'), 'secret')
    assert.throws(() => decryptLink(encrypted, 'other:link'))
    const data = Buffer.from(encrypted.slice(3), 'base64url'); data[28] ^= 1
    assert.throws(() => decryptLink('v1.' + data.toString('base64url'), 'owner:link'))
    process.env.APP_ENCRYPTION_KEY = ''
    assert.throws(() => encryptLink('secret', 'owner:link'))
  } finally {
    if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previous
  }
})

test('friend sends retain rolling history and links rotate atomically without exposing secrets', {
  skip: !process.env.PGPASSWORD ? 'Configure the separate local test database first' : false,
}, async () => {
  const previousDb = process.env.PGDATABASE, previousKey = process.env.APP_ENCRYPTION_KEY
  process.env.PGDATABASE = process.env.TEST_PGDATABASE
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  const config = databaseConfig(); assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  const ids = Array.from({ length: 4 }, () => randomUUID())
  const tokens = ids.map(() => randomBytes(32).toString('base64url'))
  let app
  try {
    await migrateDatabase(pool)
    for (let i = 0; i < ids.length; i++) {
      await pool.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,$3,$4)', [ids[i], `Send_${i}`, `send_${i}`, `send_${ids[i].slice(0,8)}`])
      await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')", [randomUUID(),ids[i],sessionHash(tokens[i])])
    }
    app = await NestFactory.create(AppModule, { logger: false }); await app.listen(0,'127.0.0.1')
    const url = await app.getUrl()
    const call = (path, method = 'GET', actor = 0, body, origin = 'http://localhost:5173') => fetch(url + path, {
      method, headers: { Origin: origin, ...(actor < 0 ? {} : { Cookie: `thongyod_session=${tokens[actor]}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const send = (target = 1) => call('/friends/requests', 'POST', 0, { userId: ids[target] })
    assert.equal((await call('/friends/requests','POST',-1,{userId:ids[1]})).status,401)
    assert.equal((await call('/friends/requests','POST',0,{userId:ids[1]},'https://evil.example')).status,403)
    assert.equal((await send(0)).status,400)
    assert.equal((await call('/friends/requests','POST',0,{userId:ids[1],extra:true})).status,400)
    const first = await send(); assert.equal(first.status,201)
    const firstRequest = await first.json()
    assert.equal(firstRequest.user.userId,ids[1]); assert.equal((await send()).status,409)
    assert.equal((await call(`/friends/requests/${firstRequest.id}`,'DELETE')).status,204)
    const second = await send(); assert.equal(second.status,201)
    const secondRequest = await second.json(); assert.notEqual(secondRequest.id,firstRequest.id)
    assert.equal((await call(`/friends/requests/${firstRequest.id}/accept`,'POST',1)).status,404)
    assert.equal((await call(`/friends/requests/${secondRequest.id}/accept`,'POST',1)).status,204)
    assert.equal((await send()).status,409)
    assert.equal((await call(`/friends/${ids[1]}`,'DELETE')).status,204)
    for (let i = 2; i < 19; i++) {
      const r = await send(); assert.equal(r.status,201)
      assert.equal((await call(`/friends/requests/${(await r.json()).id}`,'DELETE')).status,204)
    }
    const race = await Promise.all([send(1),send(2),send(3)])
    assert.deepEqual(race.map(r=>r.status).sort(),[201,429,429])
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM friend_request_sends WHERE requester_id=$1',[ids[0]])).rows[0].n,20)
    await pool.query("UPDATE friend_request_sends SET sent_at=now()-interval '25 hours' WHERE requester_id=$1",[ids[0]])
    const active = (await pool.query("SELECT id FROM friendships WHERE requester_id=$1 AND status='pending'",[ids[0]])).rows[0]
    await call(`/friends/requests/${active.id}`,'DELETE')
    assert.equal((await send()).status,201)
    await call('/blocks','POST',1,{userId:ids[0]})
    assert.equal((await send()).status,404)
    await call(`/blocks/${ids[0]}`,'DELETE',1)

    assert.equal((await call('/friends/link','GET',-1)).status,401)
    const links = await Promise.all([call('/friends/link'),call('/friends/link')])
    const codes = await Promise.all(links.map(r=>r.json()))
    assert.equal(codes[0].code,codes[1].code)
    const old = codes[0].code
    assert.equal((await call('/friend-links/'+old,'GET',1)).status,200)
    const saved = (await pool.query('SELECT token_hash,encrypted_token FROM friend_link_tokens WHERE user_id=$1 AND revoked_at IS NULL',[ids[0]])).rows[0]
    assert.ok(!saved.encrypted_token.includes(old)); assert.notEqual(saved.token_hash,old)
    assert.equal((await call('/friends/link','POST',0,undefined,'https://evil.example')).status,403)
    process.env.APP_ENCRYPTION_KEY = ''
    assert.equal((await call('/friends/link','POST')).status,503)
    assert.equal((await call('/friend-links/'+old,'GET',1)).status,200)
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    const rotated = await call('/friends/link','POST'); assert.equal(rotated.status,200)
    const fresh = (await rotated.json()).code; assert.notEqual(fresh,old)
    assert.equal((await call('/friend-links/'+old,'GET',1)).status,404)
    assert.equal((await call('/friend-links/'+fresh,'GET',1)).status,200)
    await call('/blocks','POST',1,{userId:ids[0]})
    assert.equal((await call('/friend-links/'+fresh,'GET',1)).status,404)
    const rotations = await Promise.all([call('/friends/link','POST'),call('/friends/link','POST')])
    assert.deepEqual(rotations.map(r=>r.status),[200,200])
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM friend_link_tokens WHERE user_id=$1 AND revoked_at IS NULL',[ids[0]])).rows[0].n,1)
  } finally {
    await app?.close()
    await pool.query('DELETE FROM app_notifications WHERE user_id=ANY($1::uuid[]) OR actor_id=ANY($1::uuid[])',[ids])
    for (const table of ['auth_sessions','friend_link_tokens']) await pool.query(`DELETE FROM ${table} WHERE user_id=ANY($1::uuid[])`,[ids])
    await pool.query('DELETE FROM friend_request_sends WHERE requester_id=ANY($1::uuid[]) OR recipient_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM user_blocks WHERE blocker_id=ANY($1::uuid[]) OR blocked_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM friendships WHERE requester_id=ANY($1::uuid[]) OR recipient_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]); await pool.end()
    if(previousDb===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=previousDb
    if(previousKey===undefined)delete process.env.APP_ENCRYPTION_KEY;else process.env.APP_ENCRYPTION_KEY=previousKey
  }
})
