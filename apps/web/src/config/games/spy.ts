// สายลับ: the words live in packages/shared/content/room-games.json (one copy for the app and the server, #88);
// this file adds the pack icon and colour. Content for สายลับ. Written by us; no brands, no real people, nothing scary or adult.
// Places must be ones everybody has been to or seen, so everyone can ask and answer (decision #81).
// Two ways to play:
// - places: everyone sees the same place, the spy sees only "คุณคือสายลับ".
// - pairs: most players get word A, the spy gets a SIMILAR word B (and may not know they are the spy).
import { Building2, GraduationCap, Palmtree, Sandwich, Shapes, Sparkles, type LucideIcon } from 'lucide-react'

export type SpyPlacePackId = 'campus' | 'city' | 'travel' | 'fun'
export type SpyPairPackId = 'food' | 'things' | 'mixed'
export type SpyPack<Id extends string, Item> = { id: Id; icon: LucideIcon; tint: number; items: readonly Item[] }

import content from '@thongyod/shared/content/room-games.json'

const PLACE_LOOK: Record<SpyPlacePackId, { icon: LucideIcon; tint: number }> = {
  campus: { icon: GraduationCap, tint: 5 },
  city: { icon: Building2, tint: 4 },
  travel: { icon: Palmtree, tint: 2 },
  fun: { icon: Sparkles, tint: 8 },
}
const PAIR_LOOK: Record<SpyPairPackId, { icon: LucideIcon; tint: number }> = {
  food: { icon: Sandwich, tint: 3 },
  things: { icon: Shapes, tint: 7 },
  mixed: { icon: Sparkles, tint: 1 },
}

export const SPY_PLACES: readonly SpyPack<SpyPlacePackId, string>[] = content.spyPlaces.map((p) => {
  const id = p.id as SpyPlacePackId
  return { id, ...PLACE_LOOK[id], items: p.items }
})

/** [word for most players, word for the spy] — similar enough that the spy can blend in. */
export const SPY_PAIRS: readonly SpyPack<SpyPairPackId, readonly [string, string]>[] = content.spyPairs.map((p) => {
  const id = p.id as SpyPairPackId
  return { id, ...PAIR_LOOK[id], items: p.items.map(([a, b]) => [a, b] as const) }
})
