// Cards for ใครน่าจะ… and ไม่เคย… (party deck). The cards live in packages/shared/content/room-games.json (one copy
// for the app and the server, #88); this file adds the pack icon and colour. Written by us for Thai students.
// Rules: clean, no real people, no brands, nothing about bodies, money trouble, religion or anything that hurts.
// Teasing stays light and about habits, never about who someone is. No "แซวแรง" pack until Earth decides.
// Cards are CONTENT (Thai only for now). Pack names/hints are UI text in i18n (games.party.packs.<id>).
import { Bus, GraduationCap, Home, Laugh, Rocket, Smartphone, UtensilsCrossed, type LucideIcon } from 'lucide-react'

export type PartyPackId = 'campus' | 'life' | 'trip' | 'food' | 'online' | 'future' | 'chaos'
export type PartyPack = { id: PartyPackId; icon: LucideIcon; tint: number; cards: readonly string[] }

import content from '@thongyod/shared/content/room-games.json'

const LOOK: Record<PartyPackId, { icon: LucideIcon; tint: number }> = {
  campus: { icon: GraduationCap, tint: 5 },
  life: { icon: Home, tint: 2 },
  trip: { icon: Bus, tint: 4 },
  food: { icon: UtensilsCrossed, tint: 3 },
  online: { icon: Smartphone, tint: 8 },
  future: { icon: Rocket, tint: 6 },
  chaos: { icon: Laugh, tint: 1 },
}

const withLook = (packs: readonly { id: string; cards: readonly string[] }[]): readonly PartyPack[] =>
  packs.map((p) => {
    const id = p.id as PartyPackId
    return { id, ...LOOK[id], cards: p.cards }
  })

/** ใครน่าจะ… — the card text continues "ใครน่าจะ…". */
export const MOST_LIKELY: readonly PartyPack[] = withLook(content.mostLikely)

/** ไม่เคย… — the card text continues "ฉันไม่เคย…". Players who HAVE done it fold a finger. */
export const NEVER_HAVE: readonly PartyPack[] = withLook(content.neverHave)

export const partyPack = (packs: readonly PartyPack[], id: string) => packs.find((p) => p.id === id)
