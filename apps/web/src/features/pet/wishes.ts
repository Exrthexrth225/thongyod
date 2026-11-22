// The pet asks for things (#121, like a Tamagotchi call but gentle): up to 3 times a day, something specific —
// a food, a game of ball, a bath, a pat, a tickle or a trick it knows. Granting it within an hour = coins and
// ความสนิท. Missing one costs nothing; it just stops asking until the next one.
import { localStore } from '@/lib/localStore'
import type { TrickId } from './behavior'
import type { Trait } from './personality'

export type WishKind = { kind: 'food'; food: string } | { kind: 'play' } | { kind: 'bath' } | { kind: 'pat' } | { kind: 'tickle' } | { kind: 'trick'; trick: TrickId }
export type Wish = WishKind & { id: number; at: string; done: boolean }
export type WishDay = { day: string; wishes: Wish[] }

export const WISH_MINUTES = 60
export const WISH_REWARD = { coins: 15 } as const
/** Wishes happen between these Bangkok hours. */
const FROM_H = 9
const TO_H = 21.5

/** Bangkok midnight of a day key, as a Date. */
const dayStart = (day: string) => new Date(`${day}T00:00:00+07:00`)

/** Plan today's wishes: 3 times at least 2 h apart, kinds weighted by personality (and only tricks it knows). */
export function planWishes(day: string, random: () => number, opts: { foods: string[]; tricks: TrickId[]; trait: Trait | null }): WishDay {
  const times: number[] = []
  for (let tries = 0; times.length < 3 && tries < 50; tries++) {
    const h = FROM_H + random() * (TO_H - FROM_H)
    if (times.every((t) => Math.abs(t - h) >= 2)) times.push(h)
  }
  times.sort((a, b) => a - b)
  const weights: [WishKind['kind'], number][] = [
    ['food', opts.trait === 'glutton' ? 5 : 3],
    ['play', opts.trait === 'playful' ? 5 : 3],
    ['bath', opts.trait === 'neat' ? 4 : 2],
    ['pat', opts.trait === 'cuddly' ? 5 : 2],
    ['tickle', 2],
    ['trick', opts.tricks.length ? 3 : 0],
  ]
  const total = weights.reduce((n, [, w]) => n + w, 0)
  const pickKind = (): WishKind => {
    let r = random() * total
    for (const [k, w] of weights) {
      if ((r -= w) < 0) {
        if (k === 'food') return { kind: 'food', food: opts.foods[Math.floor(random() * opts.foods.length)] }
        if (k === 'trick') return { kind: 'trick', trick: opts.tricks[Math.floor(random() * opts.tricks.length)] }
        return { kind: k }
      }
    }
    return { kind: 'pat' }
  }
  const start = dayStart(day).getTime()
  return { day, wishes: times.map((h, id) => ({ ...pickKind(), id, at: new Date(start + h * 3_600_000).toISOString(), done: false })) }
}

/** The wish open right now, if any. */
export function activeWish(d: WishDay, now: Date): Wish | null {
  const t = now.getTime()
  return d.wishes.find((w) => !w.done && t >= Date.parse(w.at) && t < Date.parse(w.at) + WISH_MINUTES * 60_000) ?? null
}

/** Does what you just did grant this wish? */
export function grants(w: WishKind, did: WishKind): boolean {
  if (w.kind !== did.kind) return false
  if (w.kind === 'food') return did.kind === 'food' && did.food === w.food
  if (w.kind === 'trick') return did.kind === 'trick' && did.trick === w.trick
  return true
}

const isDay = (x: unknown): x is WishDay => !!x && typeof (x as WishDay).day === 'string' && Array.isArray((x as WishDay).wishes)
export const wishStore = localStore<WishDay>('thongyod-pet-wishes', () => ({ day: '', wishes: [] }), isDay)
