import { existsSync, readFileSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import type { PoolConfig } from 'pg'

const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) loadEnvFile(envFile)

export function databaseConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  let host=env.PGHOST,database=env.PGDATABASE,user=env.PGUSER,password=env.PGPASSWORD,portValue=env.PGPORT
  let sslMode=env.PGSSLMODE,channelBinding=false
  if(env.DATABASE_URL){
    try{
      const url=new URL(env.DATABASE_URL)
      if(!['postgres:','postgresql:'].includes(url.protocol)||url.hash||[...url.searchParams.keys()].some(k=>!['sslmode','channel_binding'].includes(k)))throw new Error()
      host=url.hostname;database=decodeURIComponent(url.pathname.slice(1));user=decodeURIComponent(url.username);password=decodeURIComponent(url.password);portValue=url.port||'5432'
      sslMode=url.searchParams.get('sslmode')??sslMode
      const binding=url.searchParams.get('channel_binding')
      if(binding!==null&&!['require','prefer','disable'].includes(binding))throw new Error()
      channelBinding=binding==='require'||binding==='prefer'
    }catch{throw new Error('Database URL is invalid')}
  }
  const port = Number(portValue ?? '5432'),max=Number(env.PGPOOL_MAX??(env.NODE_ENV==='production'?'3':'5'))
  const mode=sslMode??(env.NODE_ENV==='production'?'verify-full':'disable')
  if (!host || !database || !user || !password || database.includes('/')
    || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Database configuration is missing or invalid; check apps/api/.env')
  }
  if(!Number.isInteger(max)||max<1||max>10||!['disable','require','verify-full'].includes(mode)
    ||(env.NODE_ENV==='production'&&mode==='disable'&&!['localhost','127.0.0.1','::1','[::1]'].includes(host)))throw new Error('Database TLS/pool configuration is invalid')
  return {
    host:host.replace(/^\[|\]$/g,''), port, database, user, password,enableChannelBinding:channelBinding,
    // Parse URL fields ourselves so pg cannot replace this verified TLS object with sslmode=require.
    ssl:mode==='disable'?false:{rejectUnauthorized:true,...(env.PGSSLROOTCERT?{ca:readFileSync(env.PGSSLROOTCERT,'utf8')}:{})},
    connectionTimeoutMillis: 5000, query_timeout: 5000, max,
  }
}

export function assertLocalDatabase(
  config: PoolConfig, database: 'thongyod_dev' | 'thongyod_test',
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'development' || env.APP_ENV !== 'local'
    || !['127.0.0.1', 'localhost', '::1'].includes(config.host ?? '')
    || config.port !== 5432 || config.database !== database
    || config.user !== 'thongyod_app') {
    throw new Error('Refusing operation: requires the named local development database and app role')
  }
}
