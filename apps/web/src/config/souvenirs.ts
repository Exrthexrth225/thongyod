// Souvenirs the pet brings back (#106). Picture = Earth's sticker sheet when it arrives (SOUVENIR_ART);
// until then a line icon on a colour block.
import { Bell, CakeSlice, Clover, CircleDot, CupSoda, Feather, Flower2, Gem, KeyRound, Lamp, Leaf, Mail, Sailboat, Shell, Star, Ticket, type LucideIcon } from 'lucide-react'
import type { SouvenirId } from '@/features/pet/away'

export const SOUVENIR_ICON: Record<SouvenirId, { icon: LucideIcon; tint: number }> = {
  leaf: { icon: Leaf, tint: 2 },
  pebble: { icon: Gem, tint: 5 },
  shell: { icon: Shell, tint: 1 },
  boat: { icon: Sailboat, tint: 8 },
  ticket: { icon: Ticket, tint: 3 },
  mangoRice: { icon: CakeSlice, tint: 3 },
  bubbleTea: { icon: CupSoda, tint: 1 },
  bell: { icon: Bell, tint: 6 },
  clover: { icon: Clover, tint: 7 },
  button: { icon: CircleDot, tint: 4 },
  starCandy: { icon: Star, tint: 3 },
  lantern: { icon: Lamp, tint: 1 },
  feather: { icon: Feather, tint: 8 },
  keychain: { icon: KeyRound, tint: 3 },
  note: { icon: Mail, tint: 4 },
  flower: { icon: Flower2, tint: 5 },
}

/** Earth's art per souvenir (#106). Empty until the sheet arrives. */
export const SOUVENIR_ART: Partial<Record<SouvenirId, string>> = {}
