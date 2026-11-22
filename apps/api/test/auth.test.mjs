import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { Pool } from 'pg'
import { NestFactory } from '@nestjs/core'
import { createDevAppModule } from '../dist/dev-auth/dev-app.module.js'
import { devLoginEnabled, assertDevRequest, assertMutationOrigin, assertProductionConfiguration } from '../dist/auth/policy.js'
import { readSessionCookie, sessionCookie, sessionHash, SESSION_SECONDS } from '../dist/auth/cookie.js'
import { databaseConfig, assertLocalDatabase } from '../dist/db/config.js'
import { migrateDatabase } from '../dist/db/migrate.js'

const origin = 'http://localhost:5173'
const localEnv = { NODE_ENV: 'development', APP_ENV: 'local', ENABLE_DEV_LOGIN: 'true' }
const request = (headers = {}, remoteAddress = '127.0.0.1', method = 'POST') => ({ headers, socket: { remoteAddress }, method })
function setEnv(values) {
  const previous = { ...process.env }
  Object.assign(process.env, values)
  return () => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous) }
}

test('all dev flags fail closed and Origin/peer checks ignore forwarded identity', () => {
  for (const node of ['development', 'production', undefined]) for (const app of ['local', 'production', undefined]) {
    const valid = node === 'development' && app === 'local'
    const env = { NODE_ENV: node, APP_ENV: app, ENABLE_DEV_LOGIN: 'true' }
    if (valid) assert.equal(devLoginEnabled(env), true)
    else assert.throws(() => devLoginEnabled(env))
    for (const flag of [undefined, 'false']) assert.equal(devLoginEnabled({ ...env, ENABLE_DEV_LOGIN: flag }), false)
  }
  assert.throws(() => devLoginEnabled({ ...localEnv, ENABLE_DEV_LOGIN: 'TRUE' }))
  const restore = setEnv(localEnv)
  try {
    assert.throws(() => assertProductionConfiguration())
    assert.doesNotThrow(() => assertDevRequest(request({ origin })))
    assert.doesNotThrow(() => assertDevRequest(request({ referer: `${origin}/gangs` }, '::ffff:127.0.0.1', 'GET')))
    for (const headers of [{}, { origin: 'null' }, { origin: 'https://evil.example' }, { origin: 'http://localhost:5173.evil.example' }, { origin: 'http://192.168.1.2:5173' }]) {
      assert.throws(() => assertDevRequest(request(headers)))
      assert.throws(() => assertMutationOrigin(request(headers)))
    }
    assert.throws(() => assertDevRequest(request({ origin, 'x-forwarded-for': '127.0.0.1' }, '192.168.1.2')))
    assert.throws(() => assertDevRequest(request({ referer: 'https://evil.example/' }, '127.0.0.1', 'GET')))
  } finally { restore() }
})

test('cookies are opaque, reject duplicates and become Secure outside local development', () => {
  const restore = setEnv(localEnv)
  try {
    const token = randomBytes(32).toString('base64url')
    const cookie = sessionCookie(token, new Date('2026-12-03T00:00:00Z'))
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//)
    assert.match(cookie, /Max-Age=2592000/); assert.ok(!cookie.includes('; Secure'))
    assert.equal(readSessionCookie(request({ cookie: cookie.split(';')[0] })), token)
    assert.equal(readSessionCookie(request({ cookie: `thongyod_session=${token}; thongyod_session=${token}` })), null)
    assert.equal(readSessionCookie(request({ cookie: 'thongyod_session=malformed' })), null)
    process.env.NODE_ENV = 'production'
    assert.match(sessionCookie(token, new Date()), /; Secure$/)
  } finally { restore() }
})

async function startProduction(env) {
  const socket = createServer()
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist-prod/main.js', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'production', APP_ENV: 'production', ENABLE_DEV_LOGIN: 'false', APP_ORIGIN: 'https://thongyod.example', PGSSLMODE:'disable', ...env, PORT: String(port) },
    stdio: 'ignore', windowsHide: true,
  })
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) return { child, url, exited: true }
    try { if ((await fetch(`${url}/health`, { signal: AbortSignal.timeout(200) })).status === 200) return { child, url, exited: false } } catch {}
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  child.kill()
  throw new Error('Production artifact startup timed out')
}
async function stop(child) {
  if (child.exitCode === null) { child.kill(); await once(child, 'exit') }
}

test('actual production artifact contains no dev module/routes and refuses enabled dev flags', async () => {
  const files = await readdir(new URL('../dist-prod/', import.meta.url), { recursive: true })
  assert.ok(!files.some(name => /dev-auth|main\.dev|seed-data/.test(name)))
  for (const name of files.filter(name => name.endsWith('.js'))) {
    const contents = await readFile(new URL(`../dist-prod/${name.replaceAll('\\', '/')}`, import.meta.url), 'utf8')
    assert.ok(!contents.includes("Controller('auth/dev')"))
    assert.ok(!contents.includes('dev-auth/'))
  }
  const production = await startProduction({})
  try {
    assert.equal(production.exited, false)
    assert.equal((await fetch(`${production.url}/auth/dev/fixtures`, { headers: { Origin: origin } })).status, 404)
    assert.equal((await fetch(`${production.url}/auth/dev/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"fixtureKey":"earth"}' })).status, 404)
    assert.equal((await fetch(`${production.url}/me`)).status, 401)
  } finally { await stop(production.child) }
  for (const flags of [localEnv, { NODE_ENV: 'production', APP_ENV: 'local', ENABLE_DEV_LOGIN: 'true' }, { NODE_ENV: 'production', APP_ENV: 'production', ENABLE_DEV_LOGIN: 'true' }]) {
    const rejected = await startProduction(flags)
    try { assert.equal(rejected.exited, true); assert.notEqual(rejected.child.exitCode, 0) } finally { await stop(rejected.child) }
  }
})

test('real dev HTTP sessions rotate, expire, revoke, and never expose stored/private fields', {
  skip: !process.env.PGPASSWORD ? 'Configure the separate local test database first' : false,
}, async () => {
  const restore = setEnv({ ...localEnv, PGDATABASE: process.env.TEST_PGDATABASE })
  let app, disabledApp, production
  const config = databaseConfig()
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  try {
    await migrateDatabase(pool)
    for (const [i, key] of ['earth', 'ton', 'beer'].entries()) {
      await pool.query('INSERT INTO users(id,fixture_key,display_name,display_name_key,bio,main_title_key,birth_date,gender,handle) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [ids[i], key, `Auth_Test_${i}`, `auth_test_${i}`, 'Test bio', i === 0 ? 'สายมู' : null, '2003-01-01', 'other', `auth_test_${i}`])
    }
    await pool.query("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES($1,$2,'line',$3)", [randomUUID(), ids[2], randomUUID()])
    app = await NestFactory.create(createDevAppModule(), { logger: false })
    await app.listen(0, '127.0.0.1')
    const url = await app.getUrl()
    const call = (route, options = {}) => fetch(url + route, { ...options, headers: { Origin: origin, ...options.headers } })
    assert.equal((await call('/me')).status, 401)
    assert.equal((await call('/me', { headers: { 'X-User-Id': ids[0] } })).status, 401)
    const fixtures = await call('/auth/dev/fixtures')
    assert.deepEqual(await fixtures.json(), [{fixtureKey:'earth',displayName:'Auth_Test_0'},{fixtureKey:'ton',displayName:'Auth_Test_1'}])
    assert.equal(fixtures.headers.get('cache-control'), 'no-store')
    assert.equal((await fetch(url + '/auth/dev/fixtures')).status, 403)
    assert.equal((await fetch(url + '/auth/dev/fixtures', { headers: { Referer: origin + '/settings' } })).status, 200)
    const login = (body, cookie) => call('/auth/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? {Cookie:cookie}: {}) }, body: JSON.stringify(body) })
    for (const body of [{}, {fixtureKey:123}, {fixtureKey:'earth',userId:ids[1]}, null]) assert.equal((await login(body)).status, 400)
    assert.equal((await login({fixtureKey:'not-a-fixture'})).status, 404)
    assert.equal((await login({fixtureKey:'beer'})).status, 404)
    assert.equal((await fetch(url + '/auth/dev/login', { method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{"fixtureKey":"earth"}' })).status,403)
    const first = await login({fixtureKey:'earth'})
    assert.equal(first.status, 200)
    const me = await first.json()
    assert.deepEqual(Object.keys(me).sort(), ['avatarUrl','bio','coverUrl','displayName','handle','handleChangeableAt','title','userId'])
    assert.equal(me.userId, ids[0]); assert.equal(me.bio, 'Test bio')
    assert.equal(me.handle, 'auth_test_0'); assert.equal(me.coverUrl, null); assert.equal(me.handleChangeableAt, null)
    const firstCookie = first.headers.get('set-cookie').split(';')[0]
    const firstToken = firstCookie.split('=')[1]
    assert.equal(firstToken.length, 43)
    const current = await call('/me', {headers:{Cookie:firstCookie}})
    assert.equal(current.status,200); assert.deepEqual(await current.json(), me)
    const changedAt = new Date(Date.now() - 24 * 3600_000)
    await pool.query('UPDATE users SET handle_changed_at=$1, cover_url=$2 WHERE id=$3', [changedAt, '/files/test-cover.webp', ids[0]])
    const cooldown = await (await call('/me', {headers:{Cookie:firstCookie}})).json()
    assert.equal(cooldown.handleChangeableAt, new Date(changedAt.getTime() + 30 * 24 * 3600_000).toISOString())
    assert.equal(cooldown.coverUrl, '/files/test-cover.webp')
    await pool.query("UPDATE users SET handle_changed_at=statement_timestamp()-interval '720 hours' WHERE id=$1", [ids[0]])
    assert.equal((await (await call('/me', {headers:{Cookie:firstCookie}})).json()).handleChangeableAt, null)
    await pool.query("UPDATE users SET handle_changed_at=statement_timestamp()-interval '31 days' WHERE id=$1", [ids[0]])
    assert.equal((await (await call('/me', {headers:{Cookie:firstCookie}})).json()).handleChangeableAt, null)
    assert.equal((await login({fixtureKey:'not-a-fixture'},firstCookie)).status,404)
    assert.equal((await call('/me', {headers:{Cookie:firstCookie}})).status,200)
    const stored = await pool.query('SELECT token_hash, expires_at-created_at AS duration FROM auth_sessions WHERE user_id=$1', [ids[0]])
    assert.equal(stored.rows.length,1)
    assert.equal(stored.rows[0].token_hash, sessionHash(firstToken))
    const duration = await pool.query('SELECT extract(epoch FROM expires_at-created_at)::int AS seconds FROM auth_sessions WHERE token_hash=$1',[sessionHash(firstToken)])
    assert.equal(duration.rows[0].seconds,SESSION_SECONDS)
    const second = await login({fixtureKey:'ton'},firstCookie)
    assert.equal(second.status,200)
    const secondCookie=second.headers.get('set-cookie').split(';')[0]
    assert.notEqual(secondCookie,firstCookie)
    assert.equal((await call('/me',{headers:{Cookie:firstCookie}})).status,401)
    assert.equal((await (await call('/me',{headers:{Cookie:secondCookie}})).json()).userId,ids[1])
    assert.equal((await fetch(url+'/auth/logout',{method:'POST',headers:{Cookie:secondCookie,Origin:'https://evil.example'}})).status,403)
    assert.equal((await call('/me',{headers:{Cookie:secondCookie}})).status,200)
    const logout=await call('/auth/logout',{method:'POST',headers:{Cookie:secondCookie}})
    assert.equal(logout.status,204);assert.equal(await logout.text(),'');assert.match(logout.headers.get('set-cookie'),/Max-Age=0/)
    assert.equal((await call('/me',{headers:{Cookie:secondCookie}})).status,401)
    assert.equal((await call('/auth/logout',{method:'POST'})).status,204)
    const third=await login({fixtureKey:'earth'})
    const thirdCookie=third.headers.get('set-cookie').split(';')[0]
    await pool.query("UPDATE auth_sessions SET created_at=now()-interval '31 days',expires_at=now()-interval '1 day' WHERE token_hash=$1",[sessionHash(thirdCookie.split('=')[1])])
    assert.equal((await call('/me',{headers:{Cookie:thirdCookie}})).status,401)
    const fourth=await login({fixtureKey:'earth'})
    const activeCookie=fourth.headers.get('set-cookie').split(';')[0]
    production=await startProduction({PGDATABASE:'thongyod_test'})
    assert.equal((await fetch(production.url+'/me',{headers:{Cookie:activeCookie,Origin:origin}})).status,401)
    const productionToken=randomBytes(32).toString('base64url')
    await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,created_at,expires_at) VALUES($1,$2,$3,'line',now(),now()+interval '30 days')",[randomUUID(),ids[1],sessionHash(productionToken)])
    const productionCookie=`thongyod_session=${productionToken}`
    const productionMe=await fetch(production.url+'/me',{headers:{Cookie:productionCookie}})
    assert.equal(productionMe.status,200);assert.equal((await productionMe.json()).userId,ids[1])
    assert.equal((await fetch(production.url+'/me',{method:'PATCH',headers:{Cookie:productionCookie,Origin:'https://evil.example','Content-Type':'application/json'},body:'{"bio":"Rejected"}'})).status,403)
    const productionPatch=await fetch(production.url+'/me',{method:'PATCH',headers:{Cookie:productionCookie,Origin:'https://thongyod.example','Content-Type':'application/json'},body:'{"bio":"Production profile"}'})
    assert.equal(productionPatch.status,200);assert.equal((await productionPatch.json()).bio,'Production profile')
    const productionLogout=await fetch(production.url+'/auth/logout',{method:'POST',headers:{Cookie:productionCookie,Origin:'https://thongyod.example'}})
    assert.equal(productionLogout.status,204);assert.match(productionLogout.headers.get('set-cookie'),/; Secure$/)
    assert.equal((await fetch(production.url+'/me',{headers:{Cookie:productionCookie}})).status,401)
    process.env.ENABLE_DEV_LOGIN='false'
    assert.equal((await call('/me',{headers:{Cookie:activeCookie}})).status,401)
    disabledApp=await NestFactory.create(createDevAppModule(),{logger:false})
    await disabledApp.listen(0,'127.0.0.1')
    assert.equal((await fetch(`${await disabledApp.getUrl()}/auth/dev/fixtures`,{headers:{Origin:origin}})).status,404)
  } finally {
    await app?.close(); await disabledApp?.close(); if(production)await stop(production.child)
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM auth_identities WHERE user_id=ANY($1::uuid[])',[ids])
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids])
    await pool.end(); restore()
  }
})

test('PATCH /me validates partial profiles and serializes handle changes without losing data', {
  skip: !process.env.PGPASSWORD ? 'Configure the separate local test database first' : false,
}, async () => {
  const restore = setEnv({ ...localEnv, PGDATABASE: process.env.TEST_PGDATABASE })
  const config = databaseConfig()
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  const ids = [randomUUID(), randomUUID()]
  const handles = ids.map(id => `profile_${id.slice(0, 8)}`)
  const tokens = ids.map(() => randomBytes(32).toString('base64url'))
  const cookies = tokens.map(token => `thongyod_session=${token}`)
  let app
  try {
    await migrateDatabase(pool)
    for (let i = 0; i < ids.length; i++) {
      await pool.query("INSERT INTO users(id,display_name,display_name_key,handle,bio) VALUES($1,$2,$3,$4,'Original bio')", [ids[i], `Profile_${i}`, `profile_${i}`, handles[i]])
      await pool.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES($1,$2,$3,'local_dev',now()+interval '30 days')", [randomUUID(), ids[i], sessionHash(tokens[i])])
    }
    app = await NestFactory.create(createDevAppModule(), { logger: false })
    await app.listen(0, '127.0.0.1')
    const url = await app.getUrl()
    const patch = (body, cookie = cookies[0], headers = {}) => fetch(url+'/me', {
      method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify(body),
    })
    const me = async (i = 0) => (await fetch(url+'/me', { headers: { Cookie: cookies[i], Origin: origin } })).json()
    const original = await me()
    const rejected = async (body, status, code) => {
      const response = await patch(body)
      assert.equal(response.status, status)
      const result = await response.json()
      assert.equal(result.error.code, code)
      return result.error
    }
    assert.equal((await patch({ bio: 'No session' }, null)).status, 401)
    assert.equal((await patch({ bio: 'Wrong origin' }, cookies[0], { Origin: 'https://evil.example' })).status, 403)
    assert.equal((await patch({ bio: 'Wrong content type' }, cookies[0], { 'Content-Type': 'text/plain' })).status, 400)
    // The framework rejects scalar JSON before it reaches the controller.
    for (const body of [null, 'text', 1]) assert.equal((await patch(body)).status, 400)
    for (const body of [[], { userId: ids[1] }, { coverUrl: '/files/no.webp' }, { handleChangedAt: null }]) {
      await rejected(body, 400, 'INVALID_REQUEST')
    }
    for (const displayName of [null, 123, '', 'A', 'A'.repeat(21), 'Name!', 'A\nB', '😀😀']) {
      await rejected({ displayName }, 400, 'INVALID_DISPLAY_NAME')
    }
    for (const bio of [123, {}, '😀'.repeat(81)]) await rejected({ bio }, 400, 'INVALID_BIO')
    for (const handle of [null, 123, '', 'abc', '1abc', 'a'.repeat(21), 'name-name', 'name name', '@@name', 'ไทยไทย']) {
      await rejected({ handle }, 400, 'INVALID_HANDLE')
    }
    await rejected({ handle: handles[1], bio: 'Must roll back' }, 409, 'HANDLE_TAKEN')
    assert.deepEqual(await me(), original)
    const empty = await patch({})
    assert.equal(empty.status, 200); assert.deepEqual(await empty.json(), original)
    const duplicate = await patch({ displayName: '  Profile_1  ', bio: `  ${'😀'.repeat(80)}  ` })
    assert.equal(duplicate.status, 200); assert.equal(duplicate.headers.get('cache-control'), 'no-store')
    const renamed = await duplicate.json()
    assert.equal(renamed.displayName, 'Profile_1'); assert.equal(renamed.bio, '😀'.repeat(80))
    assert.equal(renamed.handle, handles[0]); assert.equal(renamed.handleChangeableAt, null)
    assert.deepEqual(Object.keys(renamed).sort(), Object.keys(original).sort())
    for (const bio of [null, '   ']) {
      const cleared = await patch({ bio })
      assert.equal(cleared.status, 200); assert.equal((await cleared.json()).bio, null)
    }
    const chosen = `new_${ids[0].slice(0, 8)}`
    const changed = await patch({ handle: `  @${chosen.toUpperCase()}  ` })
    assert.equal(changed.status, 200)
    const updated = await changed.json()
    assert.equal(updated.handle, chosen)
    const stored = (await pool.query('SELECT handle_changed_at FROM users WHERE id=$1', [ids[0]])).rows[0]
    assert.equal(updated.handleChangeableAt, new Date(stored.handle_changed_at.getTime()+30*24*3600_000).toISOString())
    const same = await patch({ handle: chosen.toUpperCase(), bio: 'Still editable' })
    assert.equal(same.status, 200); assert.equal((await same.json()).handleChangeableAt, updated.handleChangeableAt)
    const retry = await rejected({ handle: `next_${ids[0].slice(0,8)}`, bio: 'Must not save' }, 429, 'HANDLE_CHANGE_TOO_SOON')
    assert.equal(retry.retryAt, updated.handleChangeableAt); assert.equal((await me()).bio, 'Still editable')
    await pool.query("UPDATE users SET handle_changed_at=clock_timestamp()-interval '720 hours' WHERE id=$1", [ids[0]])
    assert.equal((await patch({ handle: handles[0] })).status, 200)

    await pool.query('UPDATE users SET handle_changed_at=NULL WHERE id=ANY($1::uuid[])', [ids])
    const races = await Promise.all(['a','b'].map(side => patch({ handle: `race_${side}_${ids[0].slice(0,8)}`, bio: `Winner ${side}` })))
    assert.deepEqual(races.map(r => r.status).sort(), [200,429])
    const winner = await races.find(r => r.status === 200).json()
    assert.deepEqual(await me(), winner)
    assert.equal((await (await patch({ bio: 'Own account only' }, cookies[0], { 'X-User-Id': ids[1] })).json()).userId, ids[0])
    assert.equal((await me(1)).bio, 'Original bio')

    await pool.query('UPDATE users SET handle_changed_at=NULL WHERE id=ANY($1::uuid[])', [ids])
    const before = await Promise.all([me(0), me(1)])
    const sharedHandle = `taken_${ids[0].slice(0,8)}`
    const claims = await Promise.all(cookies.map((cookie, i) => patch({ handle: sharedHandle, bio: `Claim ${i}` }, cookie)))
    assert.deepEqual(claims.map(r => r.status).sort(), [200,409])
    const losingIndex = claims.findIndex(r => r.status === 409)
    assert.equal((await claims[losingIndex].json()).error.code, 'HANDLE_TAKEN')
    assert.deepEqual(await me(losingIndex), before[losingIndex])
    const edits = await Promise.all([patch({ bio: 'Concurrent bio' }), patch({ displayName: 'Concurrent_Name' })])
    assert.deepEqual(edits.map(r => r.status), [200,200])
    assert.equal((await me()).bio, 'Concurrent bio'); assert.equal((await me()).displayName, 'Concurrent_Name')
  } finally {
    await app?.close()
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])', [ids])
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids])
    await pool.end(); restore()
  }
})
