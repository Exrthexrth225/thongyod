import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'

/** Committed room changes. Listeners run after the database transaction has finished. */
@Injectable()
export class RoomEvents extends EventEmitter {
  changed(code: string) { this.emit('changed', code) }
  closed(code: string) { this.emit('closed', code) }
}

/**
 * Who is connected to which room, and which socket controls a seat.
 * In process memory on purpose: this release runs one backend instance (DECISIONS #135).
 * After a restart everyone counts as away from the restart time until they reconnect.
 */
@Injectable()
export class RoomPresence {
  private readonly sockets = new Map<string, Set<string>>() // `${code}:${playerId}` → socket ids
  private readonly awaySince = new Map<string, number>()
  private readonly controllers = new Map<string, string>()
  private readonly startedAt = Date.now()

  connect(code: string, playerId: string, socketId: string, takeControl: boolean): boolean {
    const key = `${code}:${playerId}`
    const set = this.sockets.get(key) ?? new Set<string>()
    set.add(socketId)
    this.sockets.set(key, set)
    this.awaySince.delete(key)
    if (takeControl || !this.controllers.has(key) || !set.has(this.controllers.get(key)!)) this.controllers.set(key, socketId)
    return this.controllers.get(key) === socketId
  }

  disconnect(code: string, playerId: string, socketId: string, now = Date.now()) {
    const key = `${code}:${playerId}`
    const set = this.sockets.get(key)
    if (!set) return
    set.delete(socketId)
    if (this.controllers.get(key) === socketId) {
      const next = set.values().next()
      if (next.done) this.controllers.delete(key)
      else this.controllers.set(key, next.value)
    }
    if (!set.size) { this.sockets.delete(key); this.awaySince.set(key, now) }
  }

  isOnline(code: string, playerId: string) { return this.sockets.has(`${code}:${playerId}`) }
  isController(code: string, playerId: string, socketId: string) { return this.controllers.get(`${code}:${playerId}`) === socketId }

  /** How long a player has had no connection to this room (since server start if never seen). */
  awayFor(code: string, playerId: string, now = Date.now()) {
    const key = `${code}:${playerId}`
    if (this.sockets.has(key)) return 0
    return now - (this.awaySince.get(key) ?? this.startedAt)
  }

  forget(code: string) {
    for (const map of [this.sockets, this.awaySince, this.controllers] as Map<string, unknown>[]) {
      for (const key of map.keys()) if (key.startsWith(`${code}:`)) map.delete(key)
    }
  }
}

/** Fixed-window counter per key. In memory, like presence (single instance). */
export class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>()
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (now - v.start >= this.windowMs) this.hits.delete(k)
    const entry = this.hits.get(key)
    if (!entry || now - entry.start >= this.windowMs) { this.hits.set(key, { start: now, count: 1 }); return true }
    entry.count++
    return entry.count <= this.limit
  }
}

/** Client address. Render puts the real one first in X-Forwarded-For; local runs use the socket. */
export function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for']
  if (process.env.NODE_ENV === 'production' && typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim()
  return request.socket.remoteAddress ?? 'unknown'
}

/** Same JSON with object keys sorted, so equal payloads hash the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export const payloadHash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
