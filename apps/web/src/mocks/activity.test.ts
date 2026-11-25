import { describe, expect, it, vi } from 'vitest'
import { createActivityStore, MockActivityError } from './activity'

function fixture(size = 25) {
  const gangs = [{ id: 'g1', name: 'My gang', memberIds: ['me','peer'] }, { id: 'g2', name: 'Empty gang', memberIds: ['me'] }]
  const make = (id: string, extra = {}) => ({ id, gangId: 'g1', title: id, actorName: 'Peer', createdBy: 'peer',
    createdAt: '2026-11-23T12:00:00.000Z', startsAt: '2026-11-25T12:00:00.000Z', hidden: false, ...extra })
  const rows = Array.from({ length: size }, (_, i) => make(`m${String(i).padStart(3,'0')}`))
  const blocked = new Set<string>()
  const store = createActivityStore({ meetups: () => rows, gangs: () => gangs, blocked: actor => blocked.has(actor), viewer: 'me' }, () => new Date('2026-11-24T12:00:00.000Z'))
  return { store, rows, gangs, blocked, make }
}
const params = (q = '') => new URLSearchParams(q)

describe('mock activity matches the approved backend contract', () => {
  it('starts history read, preserves previews and handles an empty gang/feed', () => {
    const { store } = fixture()
    const [gang, empty] = store.listGangs()
    expect(gang.unreadCount).toBe(0)
    expect(gang.lastOpenedAt).toBeNull()
    expect(gang.nextMeetup?.id).toBe('m000')
    expect(empty.nextMeetup).toBeNull()
    expect(store.listGangs('EMPTY')).toHaveLength(1)
    expect(fixture(0).store.feed(params())).toEqual({ items: [], nextCursor: null })
  })

  it('pages tied events without duplicates and keeps later events out of the snapshot', () => {
    const { store, rows, make } = fixture()
    const first = store.feed(params('limit=3'))
    expect(first.items).toHaveLength(3)
    rows.push(make('new', { createdAt: '2026-11-24T11:00:00.000Z' }))
    const items = [...first.items]
    let cursor = first.nextCursor
    while (cursor) {
      const next = store.feed(params('limit=7&cursor='+encodeURIComponent(cursor)))
      items.push(...next.items); cursor = next.nextCursor
    }
    expect(items).toHaveLength(25)
    expect(new Set(items.map(m => m.id)).size).toBe(25)
    expect(items.some(m => m.id === 'new')).toBe(false)
    expect(store.feed(params('limit=1')).items[0].id).toBe('new')
    expect(items.every(m => m.target.type === 'meetup' && m.target.id === m.id)).toBe(true)
  })

  it('rechecks own/hidden/blocked activity before counts, next meetup and each feed page', () => {
    const { store, rows, make, blocked } = fixture(2)
    rows.push(make('own', { createdBy: 'me' }), make('hidden', { hidden: true }), make('blocked', { createdBy: 'bad', startsAt: '2026-11-24T13:00:00.000Z' }))
    blocked.add('bad')
    const first = store.feed(params('limit=1'))
    expect(first.items[0].id).toBe('m001')
    expect(store.listGangs()[0].unreadCount).toBe(0)
    expect(store.listGangs()[0].nextMeetup?.id).toBe('m000')
    blocked.add('peer')
    expect(store.feed(params('cursor='+first.nextCursor)).items).toEqual([])
    expect(store.listGangs()[0].unreadCount).toBe(0)
  })

  it('reads only captured activity and does not roll back when replaying an older cursor', () => {
    const { store, rows, make } = fixture(1)
    const original = store.listGangs()[0].readCursor
    rows.push(make('new1'))
    const next = store.listGangs()[0].readCursor
    rows.push(make('new2'))
    expect(store.listGangs()[0].unreadCount).toBe(2)
    store.read('g1',{ readThrough: original })
    expect(store.listGangs()[0].unreadCount).toBe(2)
    const read = store.read('g1',{ readThrough: next })
    expect(store.listGangs()[0].unreadCount).toBe(1)
    expect(store.read('g1',{ readThrough: original }).readThrough).toBe(read.readThrough)
    expect(store.listGangs()[0].unreadCount).toBe(1)
    expect(store.listGangs()[0].lastOpenedAt).toBe('2026-11-24T12:00:00.000Z')
  })

  it('revokes departed membership and rejects previous-period/cross-gang read tokens', () => {
    const { store, gangs } = fixture(2)
    const old = store.listGangs()[0].readCursor
    const page = store.feed(params('limit=1'))
    expect(() => store.read('g2',{ readThrough: old })).toThrow(MockActivityError)
    gangs[0].memberIds = ['peer']
    expect(store.feed(params('cursor='+page.nextCursor)).items).toEqual([])
    expect(() => store.read('g1',{ readThrough: old })).toThrow(expect.objectContaining({ status: 404 }))
    gangs[0].memberIds.push('me')
    expect(store.listGangs()[0].unreadCount).toBe(0)
    expect(() => store.read('g1',{ readThrough: old })).toThrow(MockActivityError)
    expect(store.feed(params()).items).toEqual([])
  })

  it('rejects malformed requests and does not accept feed cursors as read tokens', () => {
    const { store } = fixture(3)
    for (const query of ['limit=0','limit=51','limit=1e1','limit=1&limit=2','cursor=bad','cursor=x&cursor=y','q=x']) {
      expect(() => store.feed(params(query))).toThrow(MockActivityError)
    }
    const feed = store.feed(params('limit=1'))
    for (const body of [null, [], {}, { readThrough: 3 }, { readThrough: 'bad' }, { readThrough: feed.nextCursor }, { readThrough: store.listGangs()[0].readCursor, extra: true }]) {
      expect(() => store.read('g1',body)).toThrow(MockActivityError)
    }
  })

  it('resolves the new demo handlers in-page with no network fallback', async () => {
    const network = vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('A demo must not use the network'))
    try {
      const { demoResponse } = await import('./browser')
      const request = (path: string, body?: object) => new Request('https://demo.example/api'+path, body ? {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      } : {})
      const feed = await demoResponse(request('/feed?limit=3'))
      expect(feed.status).toBe(200)
      expect((await feed.json()).items).toHaveLength(3)
      const list = await demoResponse(request('/gangs?limit=50'))
      const gang = (await list.json()).items[0]
      const read = await demoResponse(request(`/gangs/${gang.id}/activity/read`,{ readThrough: gang.readCursor }))
      expect(read.status).toBe(200)
      expect((await read.json()).lastOpenedAt).toBeTruthy()
      expect((await demoResponse(request(`/gangs/${gang.id}/activity/read`,{}))).status).toBe(400)
      const unknown = await demoResponse(request('/unknown-activity-api'))
      expect(unknown.status).toBe(501)
      expect((await unknown.json()).error.code).toBe('DEMO_API_NOT_IMPLEMENTED')
      expect(network).not.toHaveBeenCalled()
    } finally { network.mockRestore() }
  })
})
