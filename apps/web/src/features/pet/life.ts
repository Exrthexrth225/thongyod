// One place that records what you did with the pet (#121): personality log, ความสนิท, and whether it granted
// the wish the pet has right now (coins + bond + a cheer). Feeding / playing / bathing also go through care.ts.
import { bangkokDayKey } from '@/features/fortune/logic'
import { PET_FOODS } from '@/config/petFoods'
import { localStore } from '@/lib/localStore'
import { earnCoins } from './coins'
import { bondStore, gainBond } from './bond'
import { careLogStore, logCare, traitOf } from './personality'
import { isLearned, trickStore, TRICK_DEFS } from './tricks'
import { activeWish, grants, planWishes, WISH_REWARD, wishStore, type WishKind } from './wishes'

export const WISH_EVENT = 'thongyod:wish-granted'

/** Today's wishes, planned the first time they are needed each Bangkok day. */
export function wishesToday(now: Date = new Date()) {
  const day = bangkokDayKey(now)
  const cur = wishStore.get()
  if (cur.day === day) return cur
  const tricks = TRICK_DEFS.filter((d) => isLearned(trickStore.get(), d.id)).map((d) => d.id)
  const next = planWishes(day, Math.random, { foods: PET_FOODS.map((f) => f.id), tricks, trait: traitOf(careLogStore.get()) })
  wishStore.set(next)
  return next
}

/** Record something you did; returns true when it granted the open wish. */
export function did(what: WishKind, now: Date = new Date()): boolean {
  const day = bangkokDayKey(now)
  if (what.kind === 'pat' || what.kind === 'tickle') {
    logCare('touch')
    gainBond('touch', day)
  } else if (what.kind === 'trick') gainBond('trick', day)
  else {
    logCare(what.kind === 'food' ? 'feed' : what.kind)
    gainBond('care', day)
  }
  const plan = wishesToday(now)
  const w = activeWish(plan, now)
  if (!w || !grants(w, what)) return false
  wishStore.set({ ...plan, wishes: plan.wishes.map((x) => (x.id === w.id ? { ...x, done: true } : x)) })
  earnCoins(WISH_REWARD.coins)
  gainBond('wish', day)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WISH_EVENT))
  return true
}

/** TEST ONLY: open a wish right now. */
export function wishNowForTesting(kind: WishKind, now: Date = new Date()): void {
  const plan = wishesToday(now)
  wishStore.set({ ...plan, wishes: [...plan.wishes.filter((w) => w.done || Date.parse(w.at) > now.getTime()), { ...kind, id: Date.now(), at: new Date(now.getTime() - 1000).toISOString(), done: false }] })
}

/** A new egg: everything about the old pet starts over (coins stay, they are yours). */
export function resetPetLife(): void {
  bondStore.set({ points: 0, touchDay: null, touchToday: 0 })
  trickStore.set({ good: {}, day: null, triesToday: 0 })
  careLogStore.set({ feed: 0, play: 0, bath: 0, touch: 0, settled: null })
  wishStore.set({ day: '', wishes: [] })
}

/** A tap, poke or hug: a little ความสนิท (capped per day) and a nudge to the cuddly side. */
export function touchedPet(now: Date = new Date()): void {
  logCare('touch')
  gainBond('touch', bangkokDayKey(now))
}

// ---------- mini-game coins (#121): capped per day so games add to the day, not replace it ----------

export const GAME_COIN_CAP = 25
type GameDay = { day: string; coins: number }
export const gameDayStore = localStore<GameDay>('thongyod-pet-games', () => ({ day: '', coins: 0 }), (x): x is GameDay => !!x && typeof (x as GameDay).coins === 'number')

/** Pay out game coins up to today's cap; returns what was actually paid. */
export function payGameCoins(amount: number, now: Date = new Date()): number {
  const day = bangkokDayKey(now)
  const cur = gameDayStore.get()
  const used = cur.day === day ? cur.coins : 0
  const pay = Math.max(0, Math.min(amount, GAME_COIN_CAP - used))
  gameDayStore.set({ day, coins: used + pay })
  earnCoins(pay)
  gainBond('game', day)
  return pay
}
