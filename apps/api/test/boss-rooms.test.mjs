import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../dist/app.module.js'
import { databaseConfig, assertLocalDatabase } from '../dist/db/config.js'
import { migrateDatabase } from '../dist/db/migrate.js'

test('boss rooms enforce 6-seat cap, Neon persistence, actionId idempotency and privacy', {
  skip: !process.env.PGPASSWORD ? 'Configure separate test database' : false,
}, async () => {
  const previous = process.env.PGDATABASE
  process.env.PGDATABASE = process.env.TEST_PGDATABASE
  const config = databaseConfig()
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  const codes = []
  const guests = []
  let app, url
  const call = (path, cookie = '', method = 'GET', body) =>
    fetch(url + path, {
      method,
      headers: {
        Origin: 'http://localhost:5173',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const makeGuest = async (name) => {
    const res = await call('/auth/room-guest', '', 'POST', { displayName: name })
    assert.equal(res.status, 200)
    const cookie = res.headers.get('set-cookie').split(';')[0]
    const data = await res.json()
    guests.push(data.playerId)
    return { cookie, id: data.playerId }
  }
  async function startApp() {
    app = await NestFactory.create(AppModule, { logger: false })
    await app.listen(0, '127.0.0.1')
    url = await app.getUrl()
  }
  try {
    await migrateDatabase(pool)
    await startApp()
    const g1 = await makeGuest('BossOne')
    const g2 = await makeGuest('BossTwo')
    const g3 = await makeGuest('BossThree')
    const g4 = await makeGuest('BossFour')
    const g5 = await makeGuest('BossFive')
    const g6 = await makeGuest('BossSix')
    const g7 = await makeGuest('BossSeven')

    const created = await call('/rooms', g1.cookie, 'POST', { game: 'boss', settings: { closingSeconds: 10 } })
    assert.equal(created.status, 201)
    const room = await created.json()
    codes.push(room.code)
    assert.equal(room.maxPlayers, 6)

    for (const g of [g2, g3, g4, g5, g6]) {
      assert.equal((await call(`/rooms/${room.code}/join`, g.cookie, 'POST')).status, 200)
    }
    assert.equal((await call(`/rooms/${room.code}/join`, g7.cookie, 'POST')).status, 409)

    const started = await call(`/rooms/${room.code}/start`, g1.cookie, 'POST')
    assert.equal(started.status, 200)
    const sData = await started.json()
    assert.equal(sData.boss.phase, 'pick_start')

    const chooser = [g1, g2, g3, g4, g5, g6].find((g) => g.id === sData.boss.markerChooserId)
    const picked = await call(`/rooms/${room.code}/boss`, chooser.cookie, 'POST', {
      actionId: 'pick-1',
      expectedRevision: 1,
      action: { type: 'pick_start', spaceIndex: 4 },
    })
    assert.equal(picked.status, 200)
    const pData = await picked.json()
    assert.equal(pData.boss.markerSpace, 4)

    // Duplicate retry returns 200 idempotently
    const retry = await call(`/rooms/${room.code}/boss`, chooser.cookie, 'POST', {
      actionId: 'pick-1',
      action: { type: 'pick_start', spaceIndex: 9 },
    })
    assert.equal(retry.status, 200)
    assert.equal((await retry.json()).boss.markerSpace, 4)

    // Restart preserves state in Neon/Postgres
    await app.close()
    await startApp()
    const after = await (await call(`/rooms/${room.code}`, g1.cookie)).json()
    assert.equal(after.boss.markerSpace, 4)
    assert.equal(after.boss.myHand.length, 5)
    assert.ok(after.boss.seats.every((s) => (s.userId === g1.id ? s.exactCash === 0 : s.exactCash === null)))
  } finally {
    if (app) await app.close()
    if (codes.length) await pool.query('DELETE FROM game_rooms WHERE code = ANY($1::text[])', [codes])
    if (guests.length) await pool.query('DELETE FROM game_guest_sessions WHERE id = ANY($1::uuid[])', [guests])
    await pool.end()
    process.env.PGDATABASE = previous
  }
})
