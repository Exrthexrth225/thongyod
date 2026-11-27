// I'm the Boss! art and small helpers. Art: Earth's sheets image/imboss_1–8 (cut 2026-11-27).
import type { TFunction } from 'i18next'
import type { BossHandCard, BossView, InvestorTeam, RoomPlayer } from '@/api/types'

const FACES = import.meta.glob<string>('@/assets/boss/faces/*.webp', { eager: true, import: 'default' })
const TEAM_ART = import.meta.glob<string>('@/assets/boss/teams/*.webp', { eager: true, import: 'default' })
const CARD_ART = import.meta.glob<string>('@/assets/boss/cards/*.webp', { eager: true, import: 'default' })
const MONEY_ART = import.meta.glob<string>('@/assets/boss/money/*.webp', { eager: true, import: 'default' })
const FX_ART = import.meta.glob<string>('@/assets/boss/fx/*.webp', { eager: true, import: 'default' })
const pick = (all: Record<string, string>, name: string) => Object.entries(all).find(([path]) => path.endsWith(`/${name}.webp`))?.[1] ?? ''

export { default as tableArt } from '@/assets/boss/table.webp'
export { default as cardBackArt } from '@/assets/boss/card-back.webp'
/** Optional middle-of-the-table illustration (image/imboss_9). */
export const centerArt: string | null = Object.values(import.meta.glob<string>('@/assets/boss/center.webp', { eager: true, import: 'default' }))[0] ?? null

export const TEAMS: InvestorTeam[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
export const TEAM_COLOR: Record<InvestorTeam, string> = {
  red: '#d2443c', orange: '#f08a24', yellow: '#e6b21f', green: '#4f9a3c', blue: '#3d6fd6', purple: '#8e4fc0',
}

export type Mood = 'calm' | 'happy' | 'upset'
export const faceArt = (team: InvestorTeam, mood: Mood = 'calm') => pick(FACES, mood === 'calm' ? team : `${team}-${mood}`)
export const teamArt = (team: InvestorTeam) => pick(TEAM_ART, team)
export const cardArt = (kind: 'travel' | 'stop' | 'boss' | 'recruit') => pick(CARD_ART, kind)
export const moneyArt = (name: 'coin' | 'coins' | 'cash' | 'sack' | 'briefcase' | 'goldbars') => pick(MONEY_ART, name)
export type FxName = 'stamp' | 'pawn' | 'trophy' | 'burst' | 'confetti' | 'ribbon' | 'plane' | 'crown' | 'magnet' | 'stop' | 'medal-gold' | 'medal-coin'
export const fxArt = (name: FxName) => pick(FX_ART, name)
/** The sticker that acts out each trouble card: plane flies a team away, crown drops on the new boss, magnet pulls an investor, a hand stops it. */
export const PLAY_FX = { travel: 'plane', boss: 'crown', recruit: 'magnet', stop: 'stop' } as const satisfies Record<string, FxName>

/** All game money is whole millions of dollars. */
export const M = 1_000_000
export const millions = (amount: number) => Math.round((amount / M) * 10) / 10

/** The face a seat is shown as all game (its first investor), else a stable colour by seat order. */
export function seatTeam(view: BossView, userId: string): InvestorTeam {
  const seat = view.seats.find((s) => s.userId === userId)
  if (seat?.portrait) return seat.portrait
  if (seat?.investors[0]) return seat.investors[0]
  const i = view.seats.findIndex((s) => s.userId === userId)
  return TEAMS[(i < 0 ? 0 : i) % TEAMS.length]
}

export const nameOf = (players: RoomPlayer[], userId: string | null | undefined) => players.find((p) => p.userId === userId)?.displayName ?? '?'

const segmenter = (granularity: 'grapheme' | 'word') => (typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity }) : null)
const graphemes = segmenter('grapheme'), words = segmenter('word')
const count = (text: string) => (graphemes ? [...graphemes.segment(text)].length : Array.from(text).length)
/**
 * A name cut to about `max` characters with "…": at a word boundary when Thai word breaking allows it,
 * else between whole characters (a vowel or tone mark never leaves its letter, a leading vowel never ends the cut).
 */
export function shortName(name: string, max = 8): string {
  if (count(name) <= max) return name
  let out = ''
  for (const w of words ? [...words.segment(name)].map((x) => x.segment) : []) {
    if (count(out + w) > max) break
    out += w
  }
  if (count(out.trim()) < Math.ceil(max / 2)) {
    const parts = graphemes ? [...graphemes.segment(name)].map((x) => x.segment) : Array.from(name)
    const cut = parts.slice(0, max)
    // never stop on เ แ โ ใ ไ (they are written before the consonant they belong to) or right before ะ า ำ
    while (cut.length > 1 && (/^[เแโใไ]$/.test(cut.at(-1)!) || /^[ะาำๅ]/.test(parts[cut.length] ?? ''))) cut.pop()
    out = cut.join('')
  }
  return `${out.trimEnd()}…`
}

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

/**
 * Where each space sits on the square board: a 5×5 grid with big corner spaces and three equal spaces per side,
 * like the printed board. Clockwise from the top-left corner.
 */
const RING: [number, number][] = [
  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4],
  [5, 5], [4, 5], [3, 5], [2, 5], [1, 5], [1, 4], [1, 3], [1, 2],
]
export const ringCell = (index: number) => ({ gridColumn: RING[index][0], gridRow: RING[index][1] })
export type TileShape = 'corner' | 'top' | 'bottom' | 'left' | 'right'
/** Corners are the big squares; top/bottom spaces stand tall, left/right spaces lie wide, each with its header on the outer edge (like the printed board). */
export function ringShape(index: number): TileShape {
  const [col, row] = RING[index]
  const edgeCol = col === 1 || col === 5, edgeRow = row === 1 || row === 5
  if (edgeCol && edgeRow) return 'corner'
  return row === 1 ? 'top' : row === 5 ? 'bottom' : col === 1 ? 'left' : 'right'
}
/** Where the $ marker sits on a space: on its inner edge, half over the centre picture, so it never hides the space's icons. */
export function markerSpot(index: number): { left: string; top: string } {
  const [col, row] = RING[index]
  // mostly over the centre picture: 3.5cqmin past the inner edge
  const x = col === 1 ? 'calc(100% + 3.5cqmin)' : col === 5 ? 'calc(0% - 3.5cqmin)' : '50%'
  const y = row === 1 ? 'calc(100% + 3.5cqmin)' : row === 5 ? 'calc(0% - 3.5cqmin)' : '50%'
  return { left: x, top: y }
}

/** A card's name as printed on it. */
export function cardName(card: BossHandCard, t: TFunction) {
  if (card.kind === 'team') return t('boss.cards.team', { team: t(`boss.teamShort.${card.team}`) })
  return t(`boss.cards.${card.kind}`)
}

const TUTORIAL_KEY = 'thongyod-boss-tutorial'
/** Whether this browser has seen the I'm the Boss! intro. Storage may be missing (private mode): then show it. */
export function tutorialSeen() {
  try { return localStorage.getItem(TUTORIAL_KEY) === '1' } catch { return false }
}
export function markTutorialSeen() {
  try { localStorage.setItem(TUTORIAL_KEY, '1') } catch { /* nothing to keep */ }
}
