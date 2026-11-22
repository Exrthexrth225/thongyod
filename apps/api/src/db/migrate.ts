import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'
import { databaseConfig } from './config.js'

export async function migrateDatabase(pool: Pool): Promise<void> {
  const client=await pool.connect()
  try{
    await client.query("SELECT pg_advisory_lock(hashtextextended('thongyod:migrations',0))")
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../../drizzle/', import.meta.url)) })
  }finally{
    try{await client.query("SELECT pg_advisory_unlock(hashtextextended('thongyod:migrations',0))")}finally{client.release()}
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let pool: Pool | undefined
  try {
    pool = new Pool(databaseConfig({ ...process.env, ...(process.env.MIGRATION_DATABASE_URL ? { DATABASE_URL:process.env.MIGRATION_DATABASE_URL } : {}) }))
    await migrateDatabase(pool)
    console.log('Database migrations applied.')
  } catch {
    console.error('Migration failed. Check local database access and migration SQL; connection details are not logged.')
    process.exitCode = 1
  } finally { await pool?.end() }
}
