// เซียมซี (DECISIONS #51, #131). Pure logic: no React, no DOM.
// 28 traditional sticks (content in config/fortunes.ts). Like at a shrine: shake until ONE stick falls (sometimes two
// fall and you shake again), ask the moon blocks (ไม้ปวย) whether it is yours, then read the slip. A bad slip can be
// torn and left at the shrine; bad slips are never kept in history. One reading per day (Bangkok calendar day).

import { FORTUNES } from '@/config/fortunes'
import { secureRandomInt } from '@/lib/random'

export const STICK_COUNT = FORTUNES.length

/** Stick number, 1 … STICK_COUNT. */
export type StickNo = number
export type Level = 'good' | 'fair' | 'bad'

export function levelOf(stick: StickNo): Level {
  return FORTUNES[stick - 1]?.level ?? 'fair'
}

export const fortuneOf = (stick: StickNo) => FORTUNES[stick - 1]

export function isStickNo(n: unknown): n is StickNo {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= STICK_COUNT
}

/** The old student-life set had 40 sticks; 29–40 can still be in history, shown as "ใบเก่า" with no paper. */
export const OLD_STICK_MAX = 40
export const isOldStick = (n: number) => n > STICK_COUNT && n <= OLD_STICK_MAX

/** Calendar day in Thailand, e.g. "2026-11-04" (same rule as DECISIONS #40). */
export function bangkokDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** `torn`: a bad slip the user tore and left at the shrine (today's page then shows no paper). */
export type Draw = { day: string; stick: StickNo; torn?: boolean }

/** How many days of fortune history this device keeps. */
export const HISTORY_DAYS = 60

/** History with `draw` added: one entry per day (the newer one wins), newest first, at most `keep`. */
export function addToHistory(history: Draw[], draw: Draw, keep: number = HISTORY_DAYS): Draw[] {
  const others = history.filter((d) => d.day !== draw.day && keepsInHistory(d.stick))
  const list = keepsInHistory(draw.stick) ? [draw, ...others] : others
  return list.sort((a, b) => b.day.localeCompare(a.day)).slice(0, keep)
}

/** Good and middling slips are kept; bad ones are left at the shrine. Old sticks 29–40 stay as "ใบเก่า". */
export function keepsInHistory(stick: number): boolean {
  return isOldStick(stick) || (isStickNo(stick) && levelOf(stick) !== 'bad')
}

/** One shake: usually one stick falls; about 1 in 8 times two fall together and you shake again. */
export const DOUBLE_ODDS = 8
export type ShakeResult = { kind: 'one'; stick: StickNo } | { kind: 'two' }
export function shakeOnce(random: (max: number) => number = secureRandomInt): ShakeResult {
  if (random(DOUBLE_ODDS) === 0) return { kind: 'two' }
  return { kind: 'one', stick: random(STICK_COUNT) + 1 }
}

/**
 * Throwing the moon blocks: one flat + one round up = yes (read it); both round up = no (shake again);
 * both flat up = the gods laugh (throw again). The third throw for the same stick always says yes, so it never drags.
 */
export type Poe = 'yes' | 'no' | 'laugh'
export const POE_MAX = 3
export function throwPoe(throwsSoFar: number, random: (max: number) => number = secureRandomInt): Poe {
  if (throwsSoFar >= POE_MAX - 1) return 'yes'
  const r = random(4)
  return r < 2 ? 'yes' : r === 2 ? 'no' : 'laugh'
}

/** Today's reading if the saved one is from today. */
export function todaysDraw(now: Date, saved: Draw | null): Draw | null {
  return saved && saved.day === bangkokDayKey(now) && isStickNo(saved.stick) ? saved : null
}

/**
 * Shake detector for DeviceMotion samples (m/s², gravity included).
 * A "jolt" = the change between two samples is bigger than `threshold`.
 * A shake = `jolts` jolts within `windowMs`. After a shake it waits `cooldownMs`.
 */
export function createShakeDetector({ threshold = 18, jolts = 3, windowMs = 900, cooldownMs = 1500 } = {}) {
  let last: [number, number, number] | null = null
  let hits: number[] = []
  let quietUntil = 0
  return function feed(x: number, y: number, z: number, t: number): boolean {
    const prev = last
    last = [x, y, z]
    if (!prev || t < quietUntil) return false
    const change = Math.abs(x - prev[0]) + Math.abs(y - prev[1]) + Math.abs(z - prev[2])
    if (change < threshold) return false
    hits = [...hits.filter((h) => t - h <= windowMs), t]
    if (hits.length < jolts) return false
    hits = []
    quietUntil = t + cooldownMs
    return true
  }
}

/** When the next stick can be drawn: the coming midnight in Thailand (UTC+7, no daylight saving). */
export function nextDrawAt(now: Date): Date {
  const BKK = 7 * 3_600_000
  const local = now.getTime() + BKK
  const nextLocalMidnight = Math.floor(local / 86_400_000 + 1) * 86_400_000
  return new Date(nextLocalMidnight - BKK)
}
