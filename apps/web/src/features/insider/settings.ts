import { WORD_PACKS } from '@/config/wordPacks'
import { MINUTES, clampPlayers, type InsiderMinutes } from './logic'

export type InsiderSettings = { players: number; minutes: InsiderMinutes; packs: string[] }

export const INSIDER_DEFAULTS: InsiderSettings = { players: 5, minutes: 5, packs: ['food', 'animals', 'things', 'places', 'jobs'] }

export function fixInsiderSettings(raw: Partial<InsiderSettings>): InsiderSettings {
  const packs = (raw.packs ?? []).filter((id) => WORD_PACKS.some((p) => p.id === id))
  return {
    players: clampPlayers(raw.players ?? INSIDER_DEFAULTS.players),
    minutes: MINUTES.includes(raw.minutes as InsiderMinutes) ? (raw.minutes as InsiderMinutes) : INSIDER_DEFAULTS.minutes,
    packs: packs.length ? packs : INSIDER_DEFAULTS.packs,
  }
}

export const insiderPool = (packs: readonly string[]) => WORD_PACKS.filter((p) => packs.includes(p.id)).flatMap((p) => p.words)
