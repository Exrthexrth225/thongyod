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

test('room guests and logout preserve identity, privacy, persistence and transactional access', {
  skip: !process.env.PGPASSWORD ? 'Configure separate test database' : false,
}, async (t) => {
  const previous = process.env.PGDATABASE
  process.env.PGDATABASE = process.env.TEST_PGDATABASE
  const config = databaseConfig(); assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config), codes = [], guests = []
  const userId = randomUUID(), accountToken = randomBytes(32).toString('base64url')
  const account = `thongyod_session=${accountToken}`
  let app, url, first, second, third, spy, never
  const call = (path, cookie = '', method = 'GET', body, origin = 'http://localhost:5173') => fetch(url + path, {
    method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const identity = async (cookie) => (await call('/auth/room-identity', cookie)).json()
  const room = async (code, cookie) => (await call(`/rooms/${code}`, cookie)).json()
  const guest = async (name = 'Guest_Test') => {
    const response = await call('/auth/room-guest', '', 'POST', { displayName: name })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const cookie = response.headers.get('set-cookie').split(';')[0], data = await response.json()
    guests.push(data.playerId)
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=10800/)
    return { cookie, data }
  }
  const create = async (game, cookie) => {
    const response = await call('/rooms', cookie, 'POST', { game })
    assert.equal(response.status, 201)
    const data = await response.json(); codes.push(data.code)
    return data.code
  }
  const action = (code, cookie, act, body) => call(`/rooms/${code}/${act}`, cookie, 'POST', body)
  async function startApp() {
    app = await NestFactory.create(AppModule, { logger: false }); await app.listen(0, '127.0.0.1'); url = await app.getUrl()
  }
  try {
    await migrateDatabase(pool)
    await pool.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,$3,$4)', [userId, 'Room_Account', 'room_account', `guest_${userId.slice(0, 8)}`])
    await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')", [randomUUID(), userId, sessionHash(accountToken)])
    await startApp()
    await t.test('creates isolated hash-only guests, validates input and never creates users', async () => {
      const before = (await pool.query('SELECT count(*) AS n FROM users')).rows[0].n
      assert.deepEqual(await identity(''), { kind: 'anonymous', playerId: null, displayName: null, expiresAt: null })
      assert.equal((await call('/auth/room-guest', '', 'POST', { displayName: 'Guest' }, 'https://evil.example')).status, 403)
      for (const body of [{}, { displayName: 'x' }, { displayName: 'a'.repeat(21) }, { displayName: 'Guest', userId }]) assert.equal((await call('/auth/room-guest', '', 'POST', body)).status, 400)
      first = await guest(); second = await guest(); third = await guest('Third')
      assert.notEqual(first.data.playerId, second.data.playerId)
      assert.equal((await pool.query('SELECT count(*) AS n FROM users')).rows[0].n, before)
      const stored = (await pool.query('SELECT token_hash FROM game_guest_sessions WHERE id=$1', [first.data.playerId])).rows[0]
      assert.equal(stored.token_hash, sessionHash(first.cookie.split('=')[1]))
      assert.equal((await call('/auth/room-guest', first.cookie, 'POST', { displayName: 'Other' })).status, 200)
      assert.equal((await identity(first.cookie)).playerId, first.data.playerId)
      const duplicate = await identity(`${first.cookie}; ${first.cookie}`)
      assert.equal(duplicate.kind, 'anonymous')
    })
    await t.test('guests cannot use account data, invitations or overwrite LINE identity', async () => {
      for (const path of ['/me', '/friends', '/gangs', '/users/me/profile', '/notifications']) assert.equal((await call(path, first.cookie)).status, 401)
      assert.equal((await call('/me', first.cookie, 'PATCH', { displayName: 'Rename' })).status, 401)
      assert.equal((await identity(`${account}; ${first.cookie}`)).playerId, userId)
      assert.equal((await call('/auth/room-guest', account, 'POST', { displayName: 'Guest' })).status, 409)
      spy = await create('spy', first.cookie)
      assert.match(spy, /^\d{6}$/)
      assert.equal((await action(spy, first.cookie, 'invite', { userIds: [userId] })).status, 403)
      assert.equal((await action(spy, second.cookie, 'join')).status, 200)
      assert.equal((await action(spy, account, 'join')).status, 200)
      assert.equal((await action(spy, second.cookie, 'start')).status, 403)
      assert.equal((await action(spy, first.cookie, 'start')).status, 200)
      const views = await Promise.all([room(spy, first.cookie), room(spy, second.cookie), room(spy, account)])
      assert.equal(views.filter((v) => v.mySecret.isSpy).length, 1)
      assert.ok(views.every((v) => v.round.reveal === null))
      assert.equal(views[0].players.filter((p) => p.isGuest).length, 2)
      assert.equal((await room(spy, third.cookie)).mySecret, null)
      assert.equal((await action(spy, third.cookie, 'join')).status, 409)
    })
    await t.test('simultaneous guest joins respect capacity and expired rooms reject access', async () => {
      const full = await create('neverHave', first.cookie)
      const visitors = []
      for (let i = 0; i < 14; i++) visitors.push(await guest(`Visitor_${i}`))
      const joined = await Promise.all(visitors.map((v) => action(full, v.cookie, 'join')))
      assert.equal(joined.filter((r) => r.status === 200).length, 11)
      assert.equal(joined.filter((r) => r.status === 409).length, 3)
      assert.equal((await room(full, first.cookie)).players.length, 12)
      await pool.query("UPDATE game_rooms SET created_at=now()-interval '4 hours',expires_at=now()-interval '1 hour' WHERE code=$1", [full])
      assert.equal((await call(`/rooms/${full}`, first.cookie)).status, 404)
    })
    await t.test('restart recovers the same seat, private secret and deadline', async () => {
      const before = await room(spy, first.cookie)
      await app.close(); await startApp()
      assert.equal((await identity(first.cookie)).playerId, first.data.playerId)
      const after = await room(spy, first.cookie)
      assert.deepEqual(after.mySecret, before.mySecret)
      assert.deepEqual(after.round, before.round)
      assert.equal(after.joined, true)
    })
    await t.test('votes remain anonymous and repeated reveals never fold fingers twice', async () => {
      const likely = await create('mostLikely', second.cookie)
      await action(likely, first.cookie, 'join'); await action(likely, account, 'join'); await action(likely, second.cookie, 'start')
      await action(likely, first.cookie, 'vote', { choice: userId, roundNumber: 1 })
      const hidden = await room(likely, second.cookie)
      assert.equal(hidden.round.myVote, null); assert.equal(hidden.round.result, null); assert.equal(Object.hasOwn(hidden.round, 'votes'), false)
      await Promise.all([action(likely, second.cookie, 'vote', { choice: userId, roundNumber: 1 }), action(likely, account, 'vote', { choice: userId, roundNumber: 1 })])
      assert.equal((await room(likely, second.cookie)).round.result.tally[userId], 3)
      await action(likely, second.cookie, 'start')
      assert.equal((await action(likely, first.cookie, 'vote', { choice: userId, roundNumber: 1 })).status, 409)
      never = await create('neverHave', third.cookie)
      await action(never, account, 'join'); await action(never, third.cookie, 'start')
      await Promise.all([action(never, third.cookie, 'vote', { choice: 'have', roundNumber: 1 }), action(never, account, 'vote', { choice: 'never', roundNumber: 1 })])
      await Promise.all([action(never, third.cookie, 'reveal'), action(never, third.cookie, 'reveal')])
      assert.equal((await room(never, third.cookie)).fingers[third.data.playerId], 4)
    })
    await t.test('logout exits every room, transfers host and rejects replayed credentials', async () => {
      const response = await call('/auth/logout', first.cookie, 'POST')
      assert.equal(response.status, 204)
      assert.equal(response.headers.getSetCookie().length, 2)
      assert.ok(response.headers.getSetCookie().every((c) => c.includes('Max-Age=0')))
      const after = await room(spy, second.cookie)
      assert.equal(after.hostId, second.data.playerId)
      assert.ok(!after.players.some((p) => p.userId === first.data.playerId))
      assert.equal((await identity(first.cookie)).kind, 'anonymous')
      assert.equal((await action(spy, first.cookie, 'join')).status, 401)
      assert.equal((await call('/auth/logout', first.cookie, 'POST')).status, 204)
      const recreated = await guest('New_Guest')
      assert.notEqual(recreated.data.playerId, first.data.playerId)
    })
    await t.test('concurrent action/logout cannot restore a logged-out player', async () => {
      const simultaneous = await Promise.all([action(never, third.cookie, 'lobby'), call('/auth/logout', third.cookie, 'POST')])
      assert.equal(simultaneous[1].status, 204)
      assert.ok([200, 401].includes(simultaneous[0].status))
      const after = await room(never, account)
      assert.equal(after.hostId, userId)
      assert.ok(!after.players.some((p) => p.userId === third.data.playerId))
      assert.equal((await action(never, third.cookie, 'join')).status, 401)
    })
    await t.test('expired guests lose access; account logout leaves its identity in the database', async () => {
      await pool.query("UPDATE game_guest_sessions SET created_at=now()-interval '4 hours',expires_at=now()-interval '1 hour' WHERE id=$1", [second.data.playerId])
      assert.equal((await identity(second.cookie)).kind, 'anonymous')
      assert.equal((await call(`/rooms/${spy}`, second.cookie)).status, 401)
      assert.equal((await call('/auth/logout', account, 'POST', undefined, 'https://evil.example')).status, 403)
      assert.equal((await call('/auth/logout', account, 'POST')).status, 204)
      assert.equal((await call('/me', account)).status, 401)
      assert.equal((await pool.query('SELECT id FROM users WHERE id=$1', [userId])).rowCount, 1)
      const newToken = randomBytes(32).toString('base64url')
      await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')", [randomUUID(), userId, sessionHash(newToken)])
      const newCookie = `thongyod_session=${newToken}`
      const newRoom = await create('neverHave', newCookie)
      await call('/auth/logout', account, 'POST')
      assert.equal((await room(newRoom, newCookie)).joined, true)
    })
  } finally {
    await app?.close()
    await pool.query('DELETE FROM game_rooms WHERE code=ANY($1::text[])', [codes])
    await pool.query('DELETE FROM game_guest_sessions WHERE id=ANY($1::uuid[])', [guests])
    await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId])
    await pool.query('DELETE FROM users WHERE id=$1', [userId])
    await pool.end()
    if (previous === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = previous
  }
})
