// เกมโดเรม่อน card images (#129): which picture goes on which card. The components are in CardArt.tsx.
import type { Card } from './logic'
import type { Rank, Suit } from '@/config/games/fatCat'

export { default as backArt } from '@/assets/cards/back.webp'
export { default as queenBadge } from '@/assets/games/badge-queen.webp'
export { default as kingBadge } from '@/assets/games/badge-king.webp'

const ART = import.meta.glob<string>('@/assets/cards/*.webp', { eager: true, import: 'default' })
const art = (name: string) => ART[`/src/assets/cards/${name}.webp`]

export const pipArt = (suit: Suit) => art(`pip-${suit}`)

/** J/Q/K royals and the ornate aces have their own picture; 2–10 lay out pips. */
export function pictureOf(card: Card) {
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return art(`${card.rank.toLowerCase()}-${card.suit}`)
  if (card.rank === 'A') return art(`ace-${card.suit}`)
  return null
}

/** Pips as on a real card: [x, y] in the picture box (0–1); the lower half stands upside down. */
const L = 0.25
const R = 0.75
const col = (...ys: number[]) => ys.flatMap((y) => [[L, y], [R, y]] as [number, number][])
export const PIPS: Partial<Record<Rank, [number, number][]>> = {
  '2': [[0.5, 0.12], [0.5, 0.88]],
  '3': [[0.5, 0.12], [0.5, 0.5], [0.5, 0.88]],
  '4': col(0.12, 0.88),
  '5': [...col(0.12, 0.88), [0.5, 0.5]],
  '6': col(0.12, 0.5, 0.88),
  '7': [...col(0.12, 0.5, 0.88), [0.5, 0.31]],
  '8': [...col(0.12, 0.5, 0.88), [0.5, 0.31], [0.5, 0.69]],
  '9': [...col(0.12, 0.37, 0.63, 0.88), [0.5, 0.5]],
  '10': [...col(0.12, 0.37, 0.63, 0.88), [0.5, 0.245], [0.5, 0.755]],
}

export const isRed = (suit: Suit) => suit === 'heart' || suit === 'diamond'
