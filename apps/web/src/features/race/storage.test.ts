import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRunners } from './storage'

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
})

describe('saved runners', () => {
  it('never gives two runners the same animal (QA BUG-009)', () => {
    localStorage.setItem(
      'thongyod-race',
      JSON.stringify([
        { name: 'ต้น', racer: 'cat' },
        { name: 'ฝน', racer: 'cat' },
        { name: 'บี', racer: 'shiba' },
      ]),
    )
    const list = loadRunners()!
    expect(list.map((r) => r.name)).toEqual(['ต้น', 'ฝน', 'บี'])
    expect(list[0].racer).toBe('cat')
    expect(list[2].racer).toBe('shiba')
    expect(new Set(list.map((r) => r.racer)).size).toBe(3)
  })
})
