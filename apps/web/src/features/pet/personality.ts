// Personality from how you raise it (#121, like Tamagotchi's "what will it become?"): the care you give most
// shapes it. While it grows it only leans one way; it settles for good when it becomes an adult.
import { localStore } from '@/lib/localStore'

export type Trait = 'glutton' | 'playful' | 'neat' | 'cuddly'
export const TRAITS: Trait[] = ['glutton', 'playful', 'neat', 'cuddly']
export type CareLog = { feed: number; play: number; bath: number; touch: number; settled: Trait | null }

/** Each kind of care counts differently (a bath is rarer than a pat). */
const WEIGHT: Record<Exclude<keyof CareLog, 'settled'>, [Trait, number]> = { feed: ['glutton', 1], play: ['playful', 1.3], bath: ['neat', 3], touch: ['cuddly', 0.35] }
/** Below this much care it has no leaning yet. */
export const MIN_CARE = 8

/** The trait it leans to now (or has settled on), null if too early to tell. Ties go to the first trait. */
export function traitOf(log: CareLog): Trait | null {
  if (log.settled) return log.settled
  const score: Record<Trait, number> = { glutton: 0, playful: 0, neat: 0, cuddly: 0 }
  let total = 0
  for (const k of ['feed', 'play', 'bath', 'touch'] as const) {
    const [trait, w] = WEIGHT[k]
    score[trait] += log[k] * w
    total += log[k]
  }
  if (total < MIN_CARE) return null
  return TRAITS.reduce((best, t) => (score[t] > score[best] ? t : best), TRAITS[0])
}

const isLog = (x: unknown): x is CareLog => !!x && typeof (x as CareLog).feed === 'number'
export const careLogStore = localStore<CareLog>('thongyod-pet-carelog', () => ({ feed: 0, play: 0, bath: 0, touch: 0, settled: null }), isLog)

export function logCare(kind: Exclude<keyof CareLog, 'settled'>): void {
  const log = careLogStore.get()
  if (log.settled) return
  careLogStore.set({ ...log, [kind]: log[kind] + 1 })
}

/** Becoming an adult fixes the personality (called when the pet grows up). */
export function settleTrait(): Trait | null {
  const log = careLogStore.get()
  if (log.settled) return log.settled
  const t = traitOf(log) ?? 'cuddly'
  careLogStore.set({ ...log, settled: t })
  return t
}
