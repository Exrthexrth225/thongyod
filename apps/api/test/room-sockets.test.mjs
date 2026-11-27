import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { NestFactory } from '@nestjs/core'
import { io } from 'socket.io-client'
import { AppModule } from '../dist/app.module.js'
import { databaseConfig, assertLocalDatabase } from '../dist/db/config.js'
import { migrateDatabase } from '../dist/db/migrate.js'
import { sessionHash } from '../dist/auth/cookie.js'
import { RoomsService } from '../dist/rooms/rooms.service.js'
import { RoomPresence } from '../dist/rooms/room-support.js'

const ORIGIN = 'http://localhost:5173'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('room sockets: private views, ordering, retries, control, boards, deadlines and restart', {
  skip: !process.env.PGPASSWORD ? 'Configure separate test database' : false,
}, async (t) => {
  const previous = process.env.PGDATABASE
  process.env.PGDATABASE = process.env.TEST_PGDATABASE
  const config = databaseConfig(); assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config), sockets = [], codes = []
  const hostId = randomUUID(), hostToken = randomBytes(32).toString('base64url')
  const host = `thongyod_session=${hostToken}`
  let app, url

  const call = (path, cookie = '', method = 'GET', body, origin = ORIGIN) => fetch(url + path, {
    method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const guest = async (name) => {
    const response = await call('/auth/room-guest', '', 'POST', { displayName: name })
    assert.equal(response.status, 200)
    return { cookie: response.headers.get('set-cookie').split(';')[0], id: (await response.json()).playerId }
  }
  const createRoom = async (game) => {
    const response = await call('/rooms', host, 'POST', { game, settings: {} })
    assert.equal(response.status, 201)
    const room = await response.json(); codes.push(room.code); return room
  }
  /** A connected client that remembers every snapshot it receives. */
  const client = (cookie, origin = ORIGIN, auth) => new Promise((resolve, reject) => {
    const socket = io(url, { path: '/api/socket.io', transports: ['websocket'], reconnection: false, forceNew: true, ...(auth ? { auth } : {}), extraHeaders: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } })
    sockets.push(socket)
    const c = { socket, views: [], boards: [], closed: [], control: null }
    socket.on('room:view', ({ room, control }) => { c.views.push(room); c.control = control })
    socket.on('room:board', (data) => c.boards.push(data))
    socket.on('room:closed', (data) => c.closed.push(data))
    socket.on('connect', () => resolve(c))
    socket.on('connect_error', reject)
  })
  const ack = (c, event, data) => c.socket.timeout(5000).emitWithAck(event, data)
  const watch = (c, code, takeControl) => ack(c, 'room:watch', { code, takeControl })
  const command = (c, code, type, payload, phase, actionId = randomUUID()) => ack(c, 'room:command', { code, actionId, type, ...(phase === undefined ? {} : { phase }), ...(payload === undefined ? {} : { payload }) })
  const latest = (c) => c.views.at(-1)
  async function until(check, what, ms = 4000) {
    const end = Date.now() + ms
    while (Date.now() < end) { const value = check(); if (value) return value; await sleep(20) }
    assert.fail(`timed out waiting for ${what}`)
  }
  const atRevision = (c, revision) => until(() => c.views.find((v) => v.revision >= revision), `revision ${revision}`)
  async function startApp() { app = await NestFactory.create(AppModule, { logger: false }); await app.listen(0, '127.0.0.1'); url = await app.getUrl() }

  try {
    await migrateDatabase(pool)
    await pool.query('INSERT INTO users(id,display_name,display_name_key,handle) VALUES($1,$2,$3,$4)', [hostId, 'Socket_Host', 'socket_host', `sock_${hostId.slice(0, 8)}`])
    await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'line',now()+interval '1 day')", [randomUUID(), hostId, sessionHash(hostToken)])
    await startApp()
    const [a, b, c] = [await guest('Guest_A'), await guest('Guest_B'), await guest('Guest_C')]

    await t.test('sockets need the app origin and a room credential', async () => {
      await assert.rejects(client(a.cookie, 'https://evil.example'))
      const anonymous = await client('')
      assert.deepEqual(await watch(anonymous, '123456'), { ok: false, status: 401, code: 'UNAUTHENTICATED' })
      assert.equal((await watch(anonymous, 'abc')).code, 'INVALID_REQUEST')
    })

    let spy, hostC, ac, bc, cc
    await t.test('every player gets only their own secret, after commit, in one order', async () => {
      spy = await createRoom('spy')
      assert.equal(spy.revision, 1); assert.equal(typeof spy.phase, 'string'); assert.deepEqual(spy.boards, [])
      hostC = await client(host); ac = await client(a.cookie); bc = await client(b.cookie); cc = await client(c.cookie)
      for (const x of [hostC, ac, bc, cc]) assert.equal((await watch(x, spy.code)).ok, true)
      for (const x of [ac, bc, cc]) assert.equal((await command(x, spy.code, 'join')).ok, true)
      const lobby = await until(() => latest(hostC)?.players.length === 4 && latest(hostC), 'four players')
      assert.deepEqual(new Set(lobby.online), new Set([hostId, a.id, b.id, c.id]))
      assert.equal((await command(ac, spy.code, 'start', undefined, lobby.phase)).code, 'HOST_ONLY')
      assert.equal((await command(hostC, spy.code, 'start')).code, 'INVALID_REQUEST', 'in-game commands must name their phase')
      const started = await command(hostC, spy.code, 'start', undefined, lobby.phase)
      assert.equal(started.ok, true)
      const views = await Promise.all([hostC, ac, bc, cc].map((x) => atRevision(x, started.revision)))
      assert.ok(views.every((v) => v.revision === started.revision && v.state === 'playing'))
      assert.equal(views.filter((v) => v.mySecret.isSpy).length, 1)
      assert.ok(views.every((v) => v.round.reveal === null && !('spies' in v.round)))
      for (const x of [hostC, ac, bc, cc]) for (let i = 1; i < x.views.length; i++) assert.ok(x.views[i].revision >= x.views[i - 1].revision, 'snapshots never go backwards')
    })

    await t.test('a retried actionId applies once; a reused one with another payload is refused', async () => {
      const room = latest(hostC), id = randomUUID()
      const [first, second] = await Promise.all([command(hostC, spy.code, 'reveal', undefined, room.phase, id), command(hostC, spy.code, 'reveal', undefined, room.phase, id)])
      assert.deepEqual(first, second); assert.equal(first.ok, true)
      assert.equal((await pool.query('SELECT revision FROM game_rooms WHERE code=$1', [spy.code])).rows[0].revision * 1, first.revision)
      assert.deepEqual(await command(hostC, spy.code, 'reveal', undefined, room.phase, id), first)
      assert.equal((await command(hostC, spy.code, 'lobby', undefined, room.phase, id)).code, 'ACTION_ID_REUSED')
      assert.equal((await command(ac, spy.code, 'reveal', undefined, room.phase, id)).code, 'ACTION_ID_REUSED', 'another player cannot reuse my id')
      const revealed = await atRevision(ac, first.revision)
      assert.equal(revealed.round.reveal.spyIds.length, 1)
      // The old phase is gone: a late command from before the reveal is refused, and stays refused on retry.
      const stale = randomUUID()
      assert.equal((await command(hostC, spy.code, 'reveal', undefined, room.phase, stale)).code, 'STALE_PHASE')
      assert.equal((await command(hostC, spy.code, 'reveal', undefined, latest(hostC).phase, stale)).code, 'ACTION_ID_REUSED')
    })

    await t.test('simultaneous votes are serialized and the result is counted once', async () => {
      const party = await createRoom('neverHave')
      const players = [await client(host), ac, bc, cc]
      for (const x of players) await watch(x, party.code)
      for (const x of [ac, bc, cc]) assert.equal((await command(x, party.code, 'join')).ok, true)
      const lobby = await until(() => players[0].views.findLast((v) => v.code === party.code && v.players.length === 4), 'party lobby')
      const start = await command(players[0], party.code, 'start', undefined, lobby.phase)
      const playing = await until(() => players[0].views.find((v) => v.code === party.code && v.revision === start.revision), 'party round')
      const votes = await Promise.all(players.map((x) => command(x, party.code, 'vote', { choice: 'have' }, playing.phase)))
      assert.ok(votes.every((v) => v.ok))
      assert.deepEqual(votes.map((v) => v.revision).sort((x, y) => x - y), [1, 2, 3, 4].map((n) => start.revision + n))
      const done = await until(() => players[0].views.find((v) => v.code === party.code && v.state === 'revealed'), 'revealed')
      assert.equal(done.round.result.tally.have, 4)
      assert.ok(Object.values(done.fingers).every((n) => n === 4), 'each finger folds once')
      assert.equal((await command(ac, party.code, 'vote', { choice: 'never' }, playing.phase)).code, 'STALE_PHASE')
      players[0].socket.disconnect()
      for (const x of [ac, bc, cc]) await watch(x, spy.code)
    })

    await t.test('the newest tab controls a seat; the other only watches', async () => {
      const second = await client(a.cookie)
      await watch(second, spy.code, true)
      await until(() => second.control === true, 'second tab control')
      await until(() => ac.control === false, 'first tab loses control')
      const room = latest(second)
      assert.equal((await command(ac, spy.code, 'leave', undefined, room.phase)).code, 'NOT_CONTROLLER')
      await watch(ac, spy.code, true)
      await until(() => ac.control === true && second.control === false, 'control returns')
      second.socket.disconnect()
    })

    await t.test('a Board Screen pairs only with owner approval and never sees private data', async () => {
      const request = await call(`/rooms/${spy.code}/boards`, '', 'POST')
      assert.equal(request.status, 201)
      const cookie = request.headers.get('set-cookie')
      assert.match(cookie, /^thongyod_room_board=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax/)
      const boardCookie = cookie.split(';')[0], session = await request.json()
      assert.equal(session.board.status, 'pending'); assert.equal(session.room, null); assert.match(session.board.label, /^[A-Z0-9]{4}$/)
      assert.equal((await call(`/rooms/${spy.code}/board`, boardCookie)).status, 200)
      assert.equal((await call(`/rooms/000000/board`, boardCookie)).status, 401)
      // The owner's own iPad: signed in, yet connected as a board it acts only as the board.
      const board = await client(`${host}; ${boardCookie}`, ORIGIN, { as: 'board' })
      assert.deepEqual(await watch(board, '000001'), { ok: false, status: 403, code: 'BOARD_OTHER_ROOM' })
      await watch(board, spy.code)
      await until(() => board.boards.find((x) => x.board.status === 'pending'), 'pending board')
      const ownerView = await until(() => latest(hostC).boards.find((x) => x.id === session.board.id) && latest(hostC), 'owner sees request')
      assert.equal(ownerView.boards[0].label, session.board.label)
      assert.deepEqual(latest(ac).boards, [], 'only the owner sees board requests')
      assert.equal(board.views.length, 0)
      assert.equal((await command(ac, spy.code, 'boardApprove', { boardId: session.board.id })).code, 'HOST_ONLY')
      assert.equal((await command(board, spy.code, 'leave')).code, 'BOARD_READ_ONLY')
      assert.equal((await command(hostC, spy.code, 'boardApprove', { boardId: session.board.id })).ok, true)
      const view = await until(() => board.views.at(-1), 'board view')
      assert.equal(view.isBoard, true); assert.equal(view.joined, false); assert.equal(view.mySecret, null)
      assert.equal(view.players.length, 4, 'a board holds no seat')
      // Back to the lobby and a new round: the board still sees no secret while playing.
      const lobby = await command(hostC, spy.code, 'lobby', undefined, latest(hostC).phase)
      const ready = await atRevision(hostC, lobby.revision)
      const next = await command(hostC, spy.code, 'start', undefined, ready.phase)
      const boardPlaying = await until(() => board.views.find((v) => v.revision === next.revision), 'board playing')
      assert.equal(boardPlaying.round.reveal, null); assert.equal(boardPlaying.mySecret, null)
      assert.ok(!JSON.stringify(boardPlaying).includes((await until(() => latest(ac).revision === next.revision && latest(ac), 'a')).mySecret.text ?? '\u0000'), 'no secret text in the board payload')
      assert.equal((await command(hostC, spy.code, 'boardRevoke', { boardId: session.board.id })).ok, true)
      await until(() => board.boards.find((x) => x.board.status === 'revoked'), 'revoked board')
    })

    await t.test('reconnecting restores the seat without repeating anything', async () => {
      const before = latest(bc)
      bc.socket.disconnect()
      await until(() => !latest(hostC).online.includes(b.id) && latest(hostC), 'b offline')
      const again = await client(b.cookie)
      await watch(again, spy.code)
      const view = await until(() => again.views.at(-1), 'b view again')
      assert.equal(view.joined, true); assert.equal(view.round.number, before.round.number)
      assert.deepEqual(view.mySecret, before.mySecret)
      assert.equal(again.control, true)
      bc = again
    })

    await t.test('the owner can be replaced only after being away for two minutes', async () => {
      assert.equal((await command(ac, spy.code, 'claimHost')).code, 'HOST_ACTIVE')
      hostC.socket.disconnect()
      await until(() => !latest(ac).online.includes(hostId) && latest(ac), 'host offline')
      assert.equal(latest(ac).canClaimHost, false)
      const presence = app.get(RoomPresence)
      presence.awaySince.set(`${spy.code}:${hostId}`, Date.now() - 121_000)
      assert.equal((await command(ac, spy.code, 'claimHost')).ok, true)
      await until(() => latest(bc).hostId === a.id, 'new host')
      hostC = await client(host); await watch(hostC, spy.code)
    })

    await t.test('server deadlines resolve exactly once, also after a restart', async () => {
      await pool.query(`UPDATE game_rooms SET data=jsonb_set(data,'{spy,endsAt}',to_jsonb((now()-interval '1 second')::text)),next_deadline=now()-interval '1 second' WHERE code=$1`, [spy.code])
      const before = Number((await pool.query('SELECT revision FROM game_rooms WHERE code=$1', [spy.code])).rows[0].revision)
      await app.close()
      for (const s of sockets) s.disconnect()
      await startApp()
      const service = app.get(RoomsService)
      await Promise.all([service.sweep(), service.sweep(), service.sweep()])
      await sleep(1200)
      const row = (await pool.query("SELECT revision,data->'spy'->>'timeUp' AS up FROM game_rooms WHERE code=$1", [spy.code])).rows[0]
      assert.equal(row.up, 'true'); assert.equal(Number(row.revision), before + 1)
      const again = await client(a.cookie); await watch(again, spy.code)
      assert.equal((await until(() => again.views.at(-1), 'view')).round.timeUp, true)
      // An expired room closes for everyone watching it.
      await pool.query("UPDATE game_rooms SET expires_at=now()+interval '50 milliseconds',next_deadline=now()+interval '50 milliseconds' WHERE code=$1", [spy.code])
      await until(() => again.closed.length, 'room closed', 4000)
      assert.equal((await pool.query('SELECT 1 FROM game_rooms WHERE code=$1', [spy.code])).rowCount, 0)
    })

    await t.test("I'm the Boss!: private hands, engine moves, host skip and kick only when offline", async () => {
      const response = await call('/rooms', host, 'POST', { game: 'boss', settings: { short: true } })
      assert.equal(response.status, 201)
      const room = await response.json(); codes.push(room.code)
      assert.equal(room.maxPlayers, 6); assert.equal(room.boss, null)
      const h = await client(host), x = await client(a.cookie), y = await client(b.cookie)
      for (const z of [h, x, y]) assert.equal((await watch(z, room.code, true)).ok, true)
      for (const z of [x, y]) assert.equal((await command(z, room.code, 'join')).ok, true)
      const lobby = await until(() => latest(h)?.players.length === 3 && latest(h), 'three players')
      assert.equal((await command(h, room.code, 'start', undefined, lobby.phase)).ok, true)
      const views = await until(() => [h, x, y].every((z) => latest(z)?.boss) && [h, x, y].map(latest), 'boss views')
      for (const v of views) {
        assert.equal(v.boss.myHand.length, 5)
        assert.equal(v.boss.short, true)
        assert.equal(v.boss.seats.filter((s) => s.exactCash !== null).length, 1, 'only my own cash')
        assert.equal(v.boss.seats.every((s) => s.investors.length === 2), true, 'three players hold two investors each')
      }
      const ids = { [hostId]: h, [a.id]: x, [b.id]: y }
      const chooser = ids[views[0].boss.markerChooserId]
      assert.equal((await command(chooser, room.code, 'boss', { action: { type: 'roll_die' } })).code, 'INVALID_PHASE')
      assert.equal((await command(chooser, room.code, 'boss', { action: { type: 'pick_start', spaceIndex: 3 } })).ok, true)
      const placed = await until(() => latest(h).boss.phase === 'turn_choice' && latest(h).boss, 'marker placed')
      assert.equal(placed.markerSpace, 3)

      const turnId = placed.turnPlayerId
      const victimId = turnId === hostId ? a.id : turnId
      assert.equal((await command(h, room.code, 'bossSkip', { targetId: victimId })).code, 'PLAYER_ONLINE')
      assert.equal((await command(x, room.code, 'bossSkip', { targetId: b.id })).code, 'HOST_ONLY')
      ids[victimId].socket.disconnect()
      await until(() => !latest(h).online.includes(victimId) && latest(h), 'victim offline')
      if (victimId === turnId) {
        assert.equal((await command(h, room.code, 'bossSkip', { targetId: victimId })).ok, true)
        await until(() => latest(h).boss.turnPlayerId !== victimId, 'turn passed')
      } else {
        assert.equal((await command(h, room.code, 'bossSkip', { targetId: victimId })).code, 'NOTHING_TO_SKIP')
      }
      assert.equal((await command(h, room.code, 'bossKick', { targetId: victimId })).ok, true)
      const over = await until(() => latest(h).state === 'revealed' && latest(h), 'game over with two left')
      assert.equal(over.boss.phase, 'game_over')
      assert.equal(over.players.some((p) => p.userId === victimId), false)
      assert.equal(over.boss.seats.every((s) => s.exactCash !== null), true, 'cash revealed at the end')
    })

    await t.test('revoked credentials and floods are refused', async () => {
      const room = await createRoom('mostLikely')
      const g = await guest('Guest_D'), gc = await client(g.cookie)
      await watch(gc, room.code)
      assert.equal((await command(gc, room.code, 'join')).ok, true)
      await pool.query('UPDATE game_guest_sessions SET revoked_at=now() WHERE id=$1', [g.id])
      assert.equal((await command(gc, room.code, 'leave')).status, 401)
      const h = await client(host); await watch(h, room.code)
      const results = await Promise.all(Array.from({ length: 30 }, () => command(h, room.code, 'settings', { packs: [] })))
      assert.ok(results.some((r) => r.code === 'RATE_LIMITED'))
    })
  } finally {
    for (const s of sockets) s.disconnect()
    await app?.close()
    if (codes.length) await pool.query('DELETE FROM game_rooms WHERE code=ANY($1)', [codes])
    await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [hostId])
    await pool.query('DELETE FROM app_notifications WHERE actor_id=$1 OR user_id=$1', [hostId])
    await pool.query('DELETE FROM users WHERE id=$1', [hostId])
    await pool.end()
    if (previous === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = previous
  }
})
