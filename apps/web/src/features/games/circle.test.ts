import { describe, expect, it } from 'vitest'
import { MAX_CIRCLE, MAX_NAME, addNames, moveSeat } from './circle'

describe('circle of players', () => {
  it('adds clean names without repeats', () => {
    expect(addNames(['ต้น'], ['  ฝน  ', '', 'ต้น', 'Bee', 'bee'])).toEqual(['ต้น', 'ฝน', 'Bee'])
    expect(addNames([], ['ก'.repeat(30)])[0]).toHaveLength(MAX_NAME)
  })
  it('stops at the most people', () => {
    expect(addNames([], Array.from({ length: 30 }, (_, i) => `p${i}`))).toHaveLength(MAX_CIRCLE)
  })
  it('moves a seat up or down', () => {
    expect(moveSeat(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveSeat(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })
})
