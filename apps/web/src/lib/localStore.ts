import { useSyncExternalStore } from 'react'

/**
 * A small value kept in localStorage with a React hook (pet bond, wishes, tricks …). Reads once, writes on set,
 * notifies hooks. Storage blocked (private mode) = the value lives for this visit only.
 */
export function localStore<T>(key: string, fallback: () => T, valid: (raw: unknown) => raw is T) {
  let current: T | null = null
  const listeners = new Set<() => void>()
  const get = (): T => {
    if (current !== null) return current
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
      current = valid(raw) ? raw : fallback()
    } catch {
      current = fallback()
    }
    return current
  }
  const set = (next: T) => {
    current = next
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // this visit only
    }
    listeners.forEach((l) => l())
  }
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  const use = () => useSyncExternalStore(subscribe, get, get)
  return { get, set, use }
}
