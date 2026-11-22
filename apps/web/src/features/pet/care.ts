// The pet care actions (#119): change the needs, count a care day for growing up when every need is fine
// afterwards, pay with coins, and tick the daily "pet" mission.
import { markDone } from '@/features/daily/daily'
import { bangkokDayKey } from '@/features/fortune/logic'
import type { PetFood } from '@/config/petFoods'
import { spendCoins } from './coins'
import { recordCareDay } from './growth'
import { did } from './life'
import { applyCare, FULL, getNeedsState, isCareDay, isNightAt, needsAt, setNeedsState, type Needs } from './needs'

/** Fun from one throw of the ball. */
export const PLAY_FUN = 12

function cared(add: Partial<Needs>, now: Date) {
  const next = applyCare(getNeedsState(), now, add)
  setNeedsState(next)
  if (isCareDay(needsAt(next, now))) recordCareDay(bangkokDayKey(now))
  markDone('pet', now)
}

export type FeedResult = 'fed' | 'wish' | 'full' | 'poor' | 'asleep'
/** What a care action did: `wish` = it was what the pet asked for. */
export type CareResult = { wish: boolean }

/** Feed one item: refuses when full or asleep, needs enough coins. */
export function feed(food: PetFood, now: Date = new Date()): FeedResult {
  if (isNightAt(now)) return 'asleep'
  if (needsAt(getNeedsState(), now).food >= FULL) return 'full'
  if (!spendCoins(food.price)) return 'poor'
  cared(food.add, now)
  return did({ kind: 'food', food: food.id }, now) ? 'wish' : 'fed'
}

export function playOnce(now: Date = new Date()): CareResult {
  cared({ fun: PLAY_FUN }, now)
  return { wish: did({ kind: 'play' }, now) }
}

/** Finished a bath: fully clean. */
export function bathed(now: Date = new Date()): CareResult {
  cared({ clean: 100 }, now)
  return { wish: did({ kind: 'bath' }, now) }
}
