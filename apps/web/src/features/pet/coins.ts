// Coins (#119): earned by doing real things in the app, spent on food for the pet. Kept small and steady so the
// pet is a reason to come back, never a grind. Daily mission = +10 the first time each day, all three = +20 bonus.
import { useSyncExternalStore } from 'react'

export const START_COINS = 60
export const MISSION_COINS = 10
export const ALL_MISSIONS_BONUS = 20

const KEY = 'thongyod-coins'
let balance: number | null = null
const listeners = new Set<() => void>()

function load(): number {
  try {
    const n = Number(localStorage.getItem(KEY))
    if (localStorage.getItem(KEY) !== null && Number.isFinite(n) && n >= 0) return Math.floor(n)
  } catch {
    // fall through
  }
  return START_COINS
}
const get = () => (balance ??= load())

function set(n: number) {
  balance = Math.max(0, Math.floor(n))
  try {
    localStorage.setItem(KEY, String(balance))
  } catch {
    // this visit only
  }
  listeners.forEach((l) => l())
}

export const getCoins = () => get()
export function earnCoins(amount: number): void {
  if (amount > 0) set(get() + amount)
}
/** Pay if there is enough; false = not enough coins (nothing changes). */
export function spendCoins(amount: number): boolean {
  if (amount > get()) return false
  set(get() - amount)
  return true
}
export const resetCoins = () => set(START_COINS)

export function useCoins(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    get,
    get,
  )
}
