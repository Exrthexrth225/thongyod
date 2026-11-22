import { describe, expect, it } from 'vitest'
import { STANDARD_SET } from '@/config/games/fatCat'
import { DECK_SIZE, addScarf, copySet, deckDone, drawer, flip, fullDeck, isHand, isRuleSet, leftOf, openCard, reshuffle, resolve, rightOf, standings, startHand, targetsFor, withBuddies, type Hand } from './logic'

const R = STANDARD_SET.rules
const players = ['ต้น', 'เอิร์ธ', 'ฝน', 'บี']
const noShuffle = () => 0

function opened(turn = 0): Hand {
  return flip({ ...startHand('standard', players, noShuffle), turn })
}

describe('แมวอ้วง deck', () => {
  it('has 52 different cards', () => {
    const d = fullDeck()
    expect(d).toHaveLength(DECK_SIZE)
    expect(new Set(d.map((c) => c.rank + c.suit)).size).toBe(52)
  })
  it('flips one card at a time and ends', () => {
    let h = startHand('standard', [], noShuffle)
    expect(openCard(h)).toBeNull()
    h = flip(h)
    expect(openCard(h)).toEqual(h.deck[0])
    expect(flip(h)).toBe(h)
    for (let i = 0; i < 51; i++) h = flip(resolve(h, R['8'], {}))
    h = resolve(h, R['8'], {})
    expect(deckDone(h)).toBe(true)
    const again = reshuffle({ ...h, queen: 'ฝน' })
    expect(again.drawn).toBe(0)
    expect(again.round).toBe(2)
    expect(again.queen).toBe('ฝน')
  })
})

describe('แมวอ้วง seats and targets', () => {
  it('left is the next seat, right the one before, wrapping', () => {
    expect(leftOf(4, 3)).toBe(0)
    expect(rightOf(4, 0)).toBe(3)
  })
  it('names who a card hits', () => {
    const h = opened(0)
    expect(targetsFor(R.A, h)).toEqual({ names: ['ต้น'], choose: 0 })
    expect(targetsFor(R['4'], h).names).toEqual(['เอิร์ธ'])
    expect(targetsFor(R['6'], h).names).toEqual(['บี'])
    expect(targetsFor(R['5'], h).names).toEqual(players)
    expect(targetsFor(R['3'], h)).toEqual({ names: [], choose: 2 })
    expect(targetsFor(R.K, h).choose).toBe(-1)
  })
  it('never asks to pick more people than there are', () => {
    const h = flip(startHand('standard', ['ต้น', 'ฝน'], noShuffle))
    expect(targetsFor({ ...R['3'], picks: 3 }, h).choose).toBe(2)
  })
  it('without names only shows the card', () => {
    expect(targetsFor(R.A, flip(startHand('standard', [], noShuffle)))).toEqual({ names: [], choose: 0 })
  })
})

describe('แมวอ้วง circle memory', () => {
  it('passes the turn and counts hits', () => {
    const h = resolve(opened(1), R.A, { hit: ['เอิร์ธ'] })
    expect(h.open).toBe(false)
    expect(drawer(h)).toBe('ฝน')
    expect(h.tally).toEqual({ เอิร์ธ: 1 })
  })
  it('makes the opener of a Q the queen', () => {
    expect(resolve(opened(2), R.Q, {}).queen).toBe('ฝน')
  })
  it('chains scarf losers as buddies who get hit together', () => {
    let h = resolve(opened(0), R['7'], { loser: 'บี' })
    expect(h.scarves).toEqual(['บี'])
    h = resolve(flip(h), R['7'], { loser: 'ต้น' })
    expect(h.scarves).toEqual(['บี', 'ต้น'])
    h = resolve(flip(h), R['2'], { hit: ['ต้น'] })
    expect(h.tally).toEqual({ ต้น: 1, บี: 1 })
    expect(addScarf(['บี'], 'บี')).toEqual(['บี'])
    expect(withBuddies(['ฝน'], ['บี'])).toEqual(['ฝน'])
  })
  it('sets or clears the king rule', () => {
    let h = resolve(opened(0), R.K, { kRule: '  พูดจบต้องร้องเหมียว ' })
    expect(h.kRule).toBe('พูดจบต้องร้องเหมียว')
    h = resolve(flip(h), R.K, { kRule: '' })
    expect(h.kRule).toBeNull()
  })
  it('ranks most hits first, ties by seat', () => {
    const h = { ...startHand('standard', players, noShuffle), tally: { ฝน: 2, บี: 2, ต้น: 1 } }
    expect(standings(h).map((s) => s.name)).toEqual(['ฝน', 'บี', 'ต้น', 'เอิร์ธ'])
  })
})

describe('แมวอ้วง saved data', () => {
  it('accepts the standard set and its copies, rejects broken ones', () => {
    expect(isRuleSet(STANDARD_SET)).toBe(true)
    expect(isRuleSet(copySet(STANDARD_SET, 'x', 'ของแก๊ง'))).toBe(true)
    expect(isRuleSet({ ...STANDARD_SET, rules: { ...R, Q: { title: 'x' } } })).toBe(false)
    expect(isRuleSet(null)).toBe(false)
  })
  it('accepts a saved hand, rejects junk', () => {
    expect(isHand(startHand('standard', players))).toBe(true)
    expect(isHand({ setId: 'x' })).toBe(false)
  })
})
