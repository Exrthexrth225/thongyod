// I'm the Boss! art and small helpers. Art: Earth's sheets image/imboss_1–8 (cut 2026-11-27).
import type { BossHandCard, BossView, InvestorTeam, RoomPlayer } from '@/api/types'

const FACES = import.meta.glob<string>('@/assets/boss/faces/*.webp', { eager: true, import: 'default' })
const TEAM_ART = import.meta.glob<string>('@/assets/boss/teams/*.webp', { eager: true, import: 'default' })
const CARD_ART = import.meta.glob<string>('@/assets/boss/cards/*.webp', { eager: true, import: 'default' })
const MONEY_ART = import.meta.glob<string>('@/assets/boss/money/*.webp', { eager: true, import: 'default' })
const FX_ART = import.meta.glob<string>('@/assets/boss/fx/*.webp', { eager: true, import: 'default' })
const pick = (all: Record<string, string>, name: string) => Object.entries(all).find(([path]) => path.endsWith(`/${name}.webp`))?.[1] ?? ''

export { default as tableArt } from '@/assets/boss/table.webp'
export { default as cardBackArt } from '@/assets/boss/card-back.webp'

export const TEAMS: InvestorTeam[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
export const TEAM_COLOR: Record<InvestorTeam, string> = {
  red: '#d2443c', orange: '#f08a24', yellow: '#e6b21f', green: '#4f9a3c', blue: '#3d6fd6', purple: '#8e4fc0',
}

export type Mood = 'calm' | 'happy' | 'upset'
export const faceArt = (team: InvestorTeam, mood: Mood = 'calm') => pick(FACES, mood === 'calm' ? team : `${team}-${mood}`)
export const teamArt = (team: InvestorTeam) => pick(TEAM_ART, team)
export const cardArt = (kind: 'travel' | 'stop' | 'boss' | 'recruit') => pick(CARD_ART, kind)
export const moneyArt = (name: 'coin' | 'coins' | 'cash' | 'sack' | 'briefcase' | 'goldbars') => pick(MONEY_ART, name)
export const fxArt = (name: 'stamp' | 'pawn' | 'trophy' | 'burst' | 'confetti' | 'ribbon') => pick(FX_ART, name)

/** All game money is whole millions of dollars. */
export const M = 1_000_000
export const millions = (amount: number) => Math.round((amount / M) * 10) / 10

/** The investor a seat is shown as: its first placard, else a stable colour by seat order. */
export function seatTeam(view: BossView, userId: string): InvestorTeam {
  const seat = view.seats.find((s) => s.userId === userId)
  if (seat?.investors[0]) return seat.investors[0]
  const i = view.seats.findIndex((s) => s.userId === userId)
  return TEAMS[(i < 0 ? 0 : i) % TEAMS.length]
}

export const nameOf = (players: RoomPlayer[], userId: string | null | undefined) => players.find((p) => p.userId === userId)?.displayName ?? '?'

/** Cards grouped for the hand: same kind/team stacked. */
export function cardKey(card: BossHandCard) {
  return card.kind === 'team' || card.kind === 'travel' ? `${card.kind}:${card.team}` : card.kind
}

/** Clockwise path the marker hops from `from` to `to`, skipping closed spaces. */
export function hopPath(from: number, to: number, closed: Set<number>): number[] {
  const path: number[] = []
  let pos = from
  for (let guard = 0; pos !== to && guard < 32; guard++) {
    pos = (pos + 1) % 16
    if (!closed.has(pos) || pos === to) path.push(pos)
  }
  return path
}

/** Where each of the 16 spaces sits on the board ring (5 across the top, 3 down the right, 5 back, 3 up). */
export function ringCell(index: number): { col: number; row: number } {
  if (index < 5) return { col: index + 1, row: 1 }
  if (index < 8) return { col: 5, row: index - 3 }
  if (index < 13) return { col: 5 - (index - 8), row: 5 }
  return { col: 1, row: 5 - (index - 12) }
}
