// The pet grows up (Earth, 2026-11-22; DECISIONS #105, #119): baby → teen → adult on the 2nd and 7th day you look
// after it (a day with a feed, play or bath after which every need is fine; not necessarily in a row). It never
// shrinks, gets ill or dies.
import { useSyncExternalStore } from 'react'
import { settleTrait } from './personality'

export type Stage = 'baby' | 'teen' | 'adult'
export const STAGES: Stage[] = ['baby', 'teen', 'adult']
/** Care days needed for each stage. */
export const STAGE_AT: Record<Stage, number> = { baby: 0, teen: 2, adult: 7 }
/** Younger stages are drawn smaller (with their own art when the species has it, else the adult art). */
export const STAGE_SCALE: Record<Stage, number> = { baby: 0.72, teen: 0.86, adult: 1 }

export type Growth = { careDays: number; lastDay: string | null; stage: Stage }

export function stageOf(careDays: number): Stage {
  return careDays >= STAGE_AT.adult ? 'adult' : careDays >= STAGE_AT.teen ? 'teen' : 'baby'
}

/** Count `day` once; the stage only ever goes up. Returns the new growth and the stage reached today, if any. */
export function addCareDay(g: Growth, day: string): { growth: Growth; grewTo: Stage | null } {
  if (g.lastDay === day) return { growth: g, grewTo: null }
  const careDays = g.careDays + 1
  const reached = stageOf(careDays)
  const stage = STAGES.indexOf(reached) > STAGES.indexOf(g.stage) ? reached : g.stage
  return { growth: { careDays, lastDay: day, stage }, grewTo: stage !== g.stage ? stage : null }
}

const KEY = 'thongyod-pet-growth'
const PET_KEY = 'thongyod-pet'
/** Pets hatched before growing existed were already grown up: they stay adults. */
const GROWTH_SINCE = '2026-11-22T12:00:00.000Z'
export const GREW_EVENT = 'thongyod:pet-grew'

function load(): Growth {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Growth | null
    if (raw && typeof raw.careDays === 'number' && STAGES.includes(raw.stage)) return raw
    const pet = JSON.parse(localStorage.getItem(PET_KEY) ?? 'null') as { hatchedAt?: string } | null
    if (pet?.hatchedAt && pet.hatchedAt < GROWTH_SINCE) return { careDays: STAGE_AT.adult, lastDay: null, stage: 'adult' }
  } catch {
    // fall through
  }
  return { careDays: 0, lastDay: null, stage: 'baby' }
}

let current: Growth | null = null
const listeners = new Set<() => void>()
const get = () => (current ??= load())

/** A new egg hatched: start as a baby. */
export function resetGrowth(): void {
  current = { careDays: 0, lastDay: null, stage: 'baby' }
  save()
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage blocked: growth counts for this visit only.
  }
  listeners.forEach((l) => l())
}

/** TEST ONLY (pet tab test panel, #119): jump to a stage now, with the grow-up toast and confetti. */
export function setStageForTesting(stage: Stage): void {
  const from = get().stage
  current = { careDays: STAGE_AT[stage], lastDay: null, stage }
  save()
  if (stage === 'adult') settleTrait()
  if (stage !== from && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GREW_EVENT, { detail: stage }))
}

/** Called after a care action that left every need fine (features/pet/care.ts). */
export function recordCareDay(day: string): void {
  const r = addCareDay(get(), day)
  if (r.growth === current) return
  current = r.growth
  save()
  if (r.grewTo === 'adult') settleTrait() // grown up: its personality settles (#121)
  if (r.grewTo && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GREW_EVENT, { detail: r.grewTo }))
}

export function useGrowth(): Growth {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    get,
    get,
  )
}
