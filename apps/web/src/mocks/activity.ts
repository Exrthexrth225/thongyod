import type { ActivityFeedItem, GangActivitySummary, ListFeedResponse, ReadGangActivityResponse } from '@thongyod/shared'
import { activityMeetups, gangs, ME } from './db'
import { isBlocked } from './friends'

type Meetup = ReturnType<typeof activityMeetups>[number]
type Gang = { id: string; name: string; memberIds: string[] }
type Period = { generation: string; baseline: Set<string>; read: Set<string>; excludedHistory: Set<string>; lastOpenedAt: string | null; readSequence: number; readThrough: string }
type Snapshot = { kind: 'feed' | 'gang'; ids: string[]; periods: Map<string, string>; gangId?: string; sequence: number }

export class MockActivityError extends Error {
  status: number
  code: string
  constructor(status = 400, code = 'INVALID_REQUEST') { super(code); this.status = status; this.code = code }
}

/** Snapshot ids model the backend's transaction visibility, without a service worker. */
export function createActivityStore(source: { meetups: () => Meetup[]; gangs: () => Gang[]; blocked: (actor: string) => boolean; viewer: string }, now = () => new Date()) {
  const periods = new Map<string, Period>()
  const snapshots = new Map<string, Snapshot>()
  let sequence = 0
  function sync(initial = false) {
    const active = source.gangs().filter(g => g.memberIds.includes(source.viewer))
    for (const id of periods.keys()) if (!active.some(g => g.id === id)) periods.delete(id)
    for (const gang of active) if (!periods.has(gang.id)) {
      const ids = source.meetups().filter(m => m.gangId === gang.id).map(m => m.id)
      periods.set(gang.id, { generation: crypto.randomUUID(), baseline: new Set(ids), read: new Set(), excludedHistory: new Set(initial ? [] : ids), lastOpenedAt: null, readSequence: 0, readThrough: '' })
    }
    return active
  }
  sync(true)
  function token(snapshot: Snapshot) {
    const value = crypto.randomUUID()
    snapshots.set(value, snapshot)
    if (snapshots.size > 512) snapshots.delete(snapshots.keys().next().value!)
    return value
  }
  function eligible() {
    sync()
    return source.meetups().filter(m => periods.has(m.gangId) && !m.hidden && m.createdBy !== source.viewer
      && !source.blocked(m.createdBy) && !periods.get(m.gangId)!.excludedHistory.has(m.id))
  }
  function listGangs(q = ''): GangActivitySummary[] {
    const active = sync(), events = eligible()
    return active.filter(g => g.name.toLowerCase().includes(q.trim().toLowerCase())).map(g => {
      const period = periods.get(g.id)!
      const next = source.meetups().filter(m => m.gangId === g.id && !m.hidden && !source.blocked(m.createdBy) && m.startsAt >= now().toISOString())
        .sort((a,b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))[0]
      return { id: g.id, name: g.name, memberCount: g.memberIds.length,
        nextMeetup: next ? { id: next.id, title: next.title, startsAt: next.startsAt } : null,
        unreadCount: events.filter(m => m.gangId === g.id && !period.baseline.has(m.id) && !period.read.has(m.id)).length,
        lastOpenedAt: period.lastOpenedAt,
        readCursor: token({ kind: 'gang', gangId: g.id, ids: source.meetups().filter(m => m.gangId === g.id).map(m => m.id), periods: new Map([[g.id,period.generation]]), sequence: ++sequence }),
      }
    })
  }
  function read(gangId: string, body: unknown): ReadGangActivityResponse {
    sync()
    const period = periods.get(gangId)
    if (!period) throw new MockActivityError(404,'GANG_NOT_FOUND')
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !('readThrough' in body) || typeof body.readThrough !== 'string') throw new MockActivityError()
    const snapshot = snapshots.get(body.readThrough)
    if (!snapshot || snapshot.kind !== 'gang' || snapshot.gangId !== gangId || snapshot.periods.get(gangId) !== period.generation) throw new MockActivityError()
    snapshot.ids.forEach(id => period.read.add(id))
    if (snapshot.sequence >= period.readSequence) { period.readSequence = snapshot.sequence; period.readThrough = body.readThrough }
    period.lastOpenedAt = now().toISOString()
    return { lastOpenedAt: period.lastOpenedAt, readThrough: period.readThrough }
  }
  function feed(params: URLSearchParams): ListFeedResponse {
    for (const name of params.keys()) if (!['limit','cursor'].includes(name) || params.getAll(name).length !== 1) throw new MockActivityError()
    const limit = params.get('limit') ?? '20'
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) throw new MockActivityError()
    const visible = eligible().sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const cursor = params.get('cursor')
    const snapshot = cursor === null ? { kind: 'feed' as const, ids: visible.map(m => m.id), periods: new Map([...periods].map(([id,p]) => [id,p.generation])), sequence: ++sequence } : snapshots.get(cursor)
    if (!snapshot || snapshot.kind !== 'feed') throw new MockActivityError()
    const byId = new Map(visible.map(m => [m.id,m]))
    const remaining = snapshot.ids.flatMap(id => {
      const m = byId.get(id)
      return m && snapshot.periods.get(m.gangId) === periods.get(m.gangId)?.generation ? [m] : []
    })
    const shown = remaining.slice(0,Number(limit))
    const items: ActivityFeedItem[] = shown.map(m => ({ id: m.id, kind: 'meetup_created', actorName: m.actorName, subject: m.title,
      gangId: m.gangId, gangName: source.gangs().find(g => g.id === m.gangId)!.name, createdAt: m.createdAt, target: { type: 'meetup', id: m.id } }))
    const last = shown.at(-1)
    return { items, nextCursor: remaining.length > shown.length && last
      ? token({ ...snapshot, ids: snapshot.ids.slice(snapshot.ids.indexOf(last.id)+1) }) : null }
  }
  return { listGangs, read, feed }
}

export const activity = createActivityStore({ meetups: activityMeetups, gangs: () => gangs, blocked: actor => isBlocked(ME,actor), viewer: ME })
