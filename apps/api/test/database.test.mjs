import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { databaseConfig, assertLocalDatabase } from '../dist/db/config.js'
import { migrateDatabase } from '../dist/db/migrate.js'
import { createSeedData, fixtureId, gangSizes } from '../dist/db/seed-data.js'

test('seed safety refuses other hosts, names, roles, ports, and non-local environments', () => {
  const env = { NODE_ENV: 'development', APP_ENV: 'local' }
  const valid = { host: '127.0.0.1', port: 5432, database: 'thongyod_dev', user: 'thongyod_app' }
  assert.doesNotThrow(() => assertLocalDatabase(valid, 'thongyod_dev', env))
  for (const patch of [{ host: 'example.com' }, { host: '127.0.0.1.example.com' }, { database: 'thongyod_prod' }, { database: 'thongyod_test' }, { user: 'postgres' }, { port: 5433 }]) {
    assert.throws(() => assertLocalDatabase({ ...valid, ...patch }, 'thongyod_dev', env))
  }
  for (const patch of [{ NODE_ENV: 'production' }, { NODE_ENV: undefined }, { APP_ENV: 'staging' }, { APP_ENV: undefined }]) {
    assert.throws(() => assertLocalDatabase(valid, 'thongyod_dev', { ...env, ...patch }))
  }
  assert.throws(() => databaseConfig({}), /configuration/)
})

test('seed is repeatable and satisfies the requested fixtures and privacy cases', () => {
  const anchor = new Date('2026-11-03T05:00:00.000Z')
  const data = createSeedData(anchor)
  assert.deepEqual(data, createSeedData(anchor))
  assert.equal(data.users.length, 40)
  assert.equal(new Set(data.users.map(u => u.handle)).size, 40)
  assert.equal(new Set(data.users.map(u => u.displayNameKey)).size, 38)
  assert.equal(data.users.filter(u => u.displayName === data.users[1].displayName).length, 2)
  assert.equal(data.users.filter(u => u.displayName === data.users[2].displayName).length, 2)
  assert.equal(data.users[0].handle, 'earth_buu')
  for (const user of data.users) {
    assert.match(user.handle, /^[a-z][a-z0-9._]{3,19}$/)
    assert.equal(user.handleChangedAt, null)
    assert.equal(user.coverUrl, null)
  }
  assert.equal(data.gangs.length, 8)
  assert.deepEqual(data.memberIndexes.map(m => m.length), gangSizes)
  assert.equal(data.memberIndexes.filter(m => m.includes(0)).length, 5)
  assert.equal(data.meetups.length, 150)
  assert.equal(data.friendships.filter(f => f.status === 'accepted').length, 200)
  const earth = fixtureId('user', 'earth')
  const requests = data.friendships.filter(f => f.status === 'pending')
  assert.equal(requests.filter(f => f.recipientId === earth).length, 3)
  assert.equal(requests.filter(f => f.requesterId === earth).length, 2)
  assert.equal(data.blocks.filter(b => b.blockedId === earth).length, 1)
  assert.equal(data.blocks.filter(b => b.blockerId === earth).length, 1)
  const pairs = data.friendships.map(f => [f.requesterId, f.recipientId].sort().join(':'))
  assert.equal(new Set(pairs).size, pairs.length)
  for (const block of data.blocks) assert.ok(!pairs.includes([block.blockerId, block.blockedId].sort().join(':')))
  const earthMeetups = data.meetups.filter(m => data.memberships.some(member => member.userId === earth && member.gangId === m.gangId))
  const localDay = value => new Date(value.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
  assert.ok(earthMeetups.filter(m => localDay(m.startsAt) === '2026-11-03').length >= 2)
  assert.ok(earthMeetups.filter(m => localDay(m.startsAt) === '2026-11-04').length >= 3)
  assert.ok(earthMeetups.some(m => m.startsAt > anchor && !data.responses.some(r => r.meetupId === m.id && r.userId === earth)))
  for (const r of data.responses) {
    const meetup = data.meetups.find(m => m.id === r.meetupId)
    assert.ok(data.memberships.some(m => m.gangId === meetup.gangId && m.userId === r.userId))
    if (r.hiddenAt) assert.notEqual(r.userId, meetup.createdBy)
    if (r.answeredAt) assert.ok(r.answeredAt < meetup.startsAt)
  }
  for (const response of ['going', 'maybe', 'not_going']) assert.ok(data.responses.some(r => r.userId === earth && r.response === response))
  assert.equal(data.home.find(h => h.userId === earth).pet, null)
  assert.ok(data.home.some(h => h.pet !== null))
  assert.throws(() => createSeedData(new Date('invalid')))
})

test('PostgreSQL migrations are repeatable and constraints reject invalid data', {
  skip: !process.env.PGPASSWORD ? 'Configure apps/api/.env to run the separate test database checks' : false,
}, async () => {
  const config = databaseConfig({ ...process.env, PGDATABASE: process.env.TEST_PGDATABASE })
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  try {
    const identity = await pool.query('SELECT current_database() AS name, current_user AS role')
    assert.equal(identity.rows[0].name, 'thongyod_test')
    assert.equal(identity.rows[0].role, 'thongyod_app')
    await migrateDatabase(pool)
    await migrateDatabase(pool)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ids = [fixtureId('test-user', 0), fixtureId('test-user', 1)]
      await client.query("INSERT INTO users(id, display_name, display_name_key, handle) VALUES ($1, 'Test_A', 'test_a', 'test_a'), ($2, 'Test_A', 'test_a', 'test_b')", ids)
      for (const [query, values, code] of [
        ["INSERT INTO users(id, display_name, display_name_key, handle) VALUES ($1, 'TEST_A', 'test_a', 'test_a')", [fixtureId('test-user', 2)], '23505'],
        ["INSERT INTO users(id, display_name, display_name_key, handle) VALUES ($1, 'A', 'a', 'test_c')", [fixtureId('test-user', 3)], '23514'],
        ["INSERT INTO users(id, display_name, display_name_key) VALUES ($1, 'Test_C', 'test_c')", [fixtureId('test-user', 4)], '23502'],
        ["INSERT INTO friendships(id, requester_id, recipient_id, status, created_at) VALUES ($1,$2,$2,'accepted',now())", [fixtureId('test-friend', 0), ids[0]], '23514'],
        ["INSERT INTO user_blocks(blocker_id, blocked_id, created_at) VALUES ($1,$2,now())", [ids[0], fixtureId('missing-user', 0)], '23503'],
      ]) {
        await client.query('SAVEPOINT invalid_data')
        await assert.rejects(client.query(query, values), error => error.code === code)
        await client.query('ROLLBACK TO SAVEPOINT invalid_data')
      }
      for (const handle of ['Abcd', '1abc', 'abc', 'a'.repeat(21), 'test-name', 'test name', 'test\n', 'testไทย']) {
        await client.query('SAVEPOINT invalid_handle')
        await assert.rejects(client.query("INSERT INTO users(id, display_name, display_name_key, handle) VALUES ($1, 'Test_C', 'test_c', $2)", [randomUUID(), handle]), error => error.code === '23514')
        await client.query('ROLLBACK TO SAVEPOINT invalid_handle')
      }
      for (const handle of ['abcd', 'a'.repeat(20), 'name._09']) {
        await client.query("INSERT INTO users(id, display_name, display_name_key, handle) VALUES ($1, 'Test_A', 'test_a', $2)", [randomUUID(), handle])
      }
      await client.query("INSERT INTO friendships(id, requester_id, recipient_id, status, created_at) VALUES ($1,$2,$3,'accepted',now())", [fixtureId('test-friend', 1), ...ids])
      await client.query('SAVEPOINT reverse_friend')
      await assert.rejects(client.query("INSERT INTO friendships(id, requester_id, recipient_id, status, created_at) VALUES ($1,$2,$3,'pending',now())", [fixtureId('test-friend', 2), ids[1], ids[0]]), error => error.code === '23505')
      await client.query('ROLLBACK TO SAVEPOINT reverse_friend')
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  } finally { await pool.end() }
})

test('handle migration upgrades legacy users without changing their data or sessions', {
  skip: !process.env.PGPASSWORD ? 'Configure the separate local test database first' : false,
}, async () => {
  const config = databaseConfig({ ...process.env, PGDATABASE: process.env.TEST_PGDATABASE })
  assertLocalDatabase(config, 'thongyod_test')
  const pool = new Pool(config)
  let client
  try {
    await migrateDatabase(pool)
    client = await pool.connect()
    await client.query('BEGIN')
    const namespace = `handle_upgrade_${randomUUID().replaceAll('-', '')}`
    await client.query(`CREATE SCHEMA "${namespace}"`)
    await client.query(`SET LOCAL search_path TO "${namespace}", public`)
    const legacy = await readFile(new URL('../drizzle/0000_mute_kulan_gath.sql', import.meta.url), 'utf8')
    for (const table of ['users', 'auth_sessions']) {
      const statement = legacy.match(new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`))
      assert.ok(statement, `Legacy ${table} definition is required`)
      await client.query(statement[0])
    }
    await client.query('ALTER TABLE auth_sessions ADD FOREIGN KEY (user_id) REFERENCES users(id)')
    const ids = [randomUUID(), randomUUID()]
    await client.query("INSERT INTO users(id,fixture_key,display_name,display_name_key,bio,birth_date,gender) VALUES ($1,'legacy_a','Legacy_A','legacy_a','Keep this bio','2003-01-01','other'), ($2,'legacy_b','Legacy_B','legacy_b',NULL,NULL,'unspecified')", ids)
    await client.query("INSERT INTO auth_sessions(id,user_id,token_hash,source,expires_at) VALUES ($1,$2,$3,'line',now()+interval '30 days')", [randomUUID(), ids[0], 'a'.repeat(64)])
    const beforeUsers = await client.query('SELECT to_jsonb(u) AS data FROM users u ORDER BY id')
    const beforeSessions = await client.query('SELECT * FROM auth_sessions ORDER BY id')
    const migration = await readFile(new URL('../drizzle/0001_user_handles.sql', import.meta.url), 'utf8')
    await client.query(migration)
    const afterUsers = await client.query("SELECT to_jsonb(u) - ARRAY['handle','handle_changed_at','cover_url'] AS data FROM users u ORDER BY id")
    assert.deepEqual(afterUsers.rows, beforeUsers.rows)
    assert.deepEqual((await client.query('SELECT * FROM auth_sessions ORDER BY id')).rows, beforeSessions.rows)
    const handles = await client.query('SELECT handle, handle_changed_at, cover_url FROM users ORDER BY id')
    assert.deepEqual(handles.rows, [
      { handle: 'user_1', handle_changed_at: null, cover_url: null },
      { handle: 'user_2', handle_changed_at: null, cover_url: null },
    ])
    await client.query("UPDATE users SET display_name='Same_Name', display_name_key='same_name'")
    assert.equal((await client.query("SELECT count(*)::int AS n FROM users WHERE display_name='Same_Name'")).rows[0].n, 2)
  } finally {
    if (client) { await client.query('ROLLBACK'); client.release() }
    await pool.end()
  }
})
