// เกมโดเรม่อน (id fatCat) (#126): a card drawer for the circle. Pure functions over one `Table`, driven as a state machine:
//   shuffling (1.5 s, the screen's timer) → down (the current player's name on the card back) → up (the card and its rule)
//   → down for the next player … and when the deck is empty, reshuffle → shuffling.
// Every turn-changing action (draw, skip) first saves a snapshot on the undo stack (memento), so undo can step back
// any number of times. Who is playing (names, AFK) is edited live and is never rolled back by undo.
import { RANKS, SUITS, type Rank, type RuleSet, type Suit } from '@/config/games/fatCat'
import { shuffle } from '@/lib/random'

export type Card = { rank: Rank; suit: Suit; deck: number }
export type Player = { name: string; afk: boolean }
export type Phase = 'shuffling' | 'down' | 'up'
export type KMode = 'replace' | 'stack'
export type Draw = { turn: number; player: string | null; card: Card; title: string; text: string; at: number }

export type Table = {
  setId: string
  decks: 1 | 2
  kMode: KMode
  players: Player[]
  /** Index of the player whose turn it is (meaningless with no players). */
  seat: number
  /** 1 = round to the left (next in the list), -1 = the other way. */
  dir: 1 | -1
  phase: Phase
  /** The shuffled cards; deck[drawn] is the next one, deck[drawn - 1] the face-up one while phase is 'up'. */
  deck: Card[]
  drawn: number
  queen: string | null
  kRules: string[]
  history: Draw[]
}

/** The part of a table that undo restores (everything but who is playing). */
type Memento = Omit<Table, 'players'> & { seatName: string | null }

export const UNDO_MAX = 40
export const SHUFFLE_MS = 1500
/** After a card turns face up, taps are ignored this long so a double tap does not skip it. */
export const REVEAL_LOCK_MS = 1000
export const MAX_NAME = 20

export const deckOf = (decks: 1 | 2): Card[] => Array.from({ length: decks }, (_, deck) => SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit, deck })))).flat()

export function newTable(setId: string, names: readonly string[], opts: { decks?: 1 | 2; kMode?: KMode; first?: number } = {}, random?: (max: number) => number): Table {
  const decks = opts.decks ?? 1
  const players = names.map((name) => ({ name, afk: false }))
  return {
    setId,
    decks,
    kMode: opts.kMode ?? 'replace',
    players,
    seat: players.length ? Math.min(Math.max(opts.first ?? 0, 0), players.length - 1) : 0,
    dir: 1,
    phase: 'shuffling',
    deck: shuffle(deckOf(decks), random),
    drawn: 0,
    queen: null,
    kRules: [],
    history: [],
  }
}

// ---------- reading ----------

export const current = (t: Table): Player | null => (t.players.length ? (t.players[t.seat] ?? null) : null)
export const faceUp = (t: Table): Card | null => (t.phase === 'up' ? (t.deck[t.drawn - 1] ?? null) : null)
export const cardsLeft = (t: Table) => t.deck.length - t.drawn
export const deckEmpty = (t: Table) => t.phase === 'down' && t.drawn >= t.deck.length
/** Players exist but every one of them is away: nobody can draw. */
export const allAway = (t: Table) => t.players.length > 0 && t.players.every((p) => p.afk)
export const canDraw = (t: Table) => t.phase === 'down' && !deckEmpty(t) && !allAway(t)

/** The next seat in the current direction that is not AFK; `from` itself if nobody else is (or all are away). */
export function nextSeat(players: readonly Player[], from: number, dir: 1 | -1): number {
  const n = players.length
  if (!n) return 0
  for (let k = 1; k <= n; k++) {
    const i = (((from + dir * k) % n) + n) % n
    if (!players[i].afk) return i
  }
  return ((from % n) + n) % n
}

// ---------- the state machine ----------

/** shuffling → down (the screen calls this after SHUFFLE_MS). If the current player is away, the turn moves on. */
export function shuffled(t: Table): Table {
  if (t.phase !== 'shuffling') return t
  return { ...t, phase: 'down', seat: settle(t.players, t.seat, t.dir) }
}

/** down → up: draw the top card for the current player (snapshot first). */
export function draw(t: Table, undo: Memento[], set: RuleSet, now: number): { table: Table; undo: Memento[] } {
  if (!canDraw(t)) return { table: t, undo }
  const card = t.deck[t.drawn]
  const who = current(t)?.name ?? null
  const rule = set.rules[card.rank]
  const table: Table = {
    ...t,
    phase: 'up',
    drawn: t.drawn + 1,
    queen: card.rank === 'Q' && who ? who : t.queen,
    history: [...t.history, { turn: t.history.length + 1, player: who, card, title: rule.title, text: rule.text, at: now }],
  }
  return { table, undo: push(undo, t) }
}

/** up → down: the next player's turn (not an undo point: undo goes back to before the draw). */
export function next(t: Table): Table {
  if (t.phase !== 'up') return t
  return { ...t, phase: 'down', seat: nextSeat(t.players, t.seat, t.dir) }
}

/** Skip the current player without drawing (snapshot first). */
export function skip(t: Table, undo: Memento[]): { table: Table; undo: Memento[] } {
  if (t.phase === 'shuffling' || t.players.length < 2 || allAway(t)) return { table: t, undo }
  const base = t.phase === 'up' ? next(t) : t
  return { table: { ...base, phase: 'down', seat: nextSeat(base.players, base.seat, base.dir) }, undo: push(undo, t) }
}

/** The deck is used up: a fresh shuffle, keeping players, turn, queen, king rules and history. */
export function reshuffle(t: Table, random?: (max: number) => number): Table {
  return { ...t, phase: 'shuffling', deck: shuffle(deckOf(t.decks), random), drawn: 0 }
}

/** Undo the last draw or skip. Who is playing stays as it is now; the turn goes back to that player if still here. */
export function undoLast(t: Table, undo: Memento[]): { table: Table; undo: Memento[] } {
  const last = undo[undo.length - 1]
  if (!last) return { table: t, undo }
  const { seatName, ...rest } = last
  const byName = seatName ? t.players.findIndex((p) => p.name === seatName) : -1
  const seat = byName >= 0 ? byName : Math.min(last.seat, Math.max(t.players.length - 1, 0))
  return { table: { ...rest, players: t.players, seat }, undo: undo.slice(0, -1) }
}

// ---------- live changes (not undo points) ----------

export const reverse = (t: Table): Table => ({ ...t, dir: t.dir === 1 ? -1 : 1 })

/** The king's new rule: replaces the old one, or adds to the list (kMode). Blank = nothing. */
export function addKingRule(t: Table, text: string): Table {
  const rule = text.trim().slice(0, 120)
  if (!rule) return t
  return { ...t, kRules: t.kMode === 'stack' ? [...t.kRules, rule] : [rule] }
}
export const clearKingRules = (t: Table): Table => ({ ...t, kRules: [] })

export function setAway(t: Table, name: string, afk: boolean): Table {
  const players = t.players.map((p) => (p.name === name ? { ...p, afk } : p))
  // The current player stepped away before drawing: the turn moves on.
  const seat = t.phase === 'down' ? settle(players, t.seat, t.dir) : t.seat
  return { ...t, players, seat }
}

/** Add a player just before the current one in turn order (so they come round last), or at the end with no one yet. */
export function addPlayer(t: Table, raw: string): Table {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)
  if (!name || t.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return t
  if (!t.players.length) return { ...t, players: [{ name, afk: false }], seat: 0 }
  const at = t.dir === 1 ? t.seat : t.seat + 1
  const players = [...t.players.slice(0, at), { name, afk: false }, ...t.players.slice(at)]
  return { ...t, players, seat: t.dir === 1 ? t.seat + 1 : t.seat }
}

/** Remove a player; if it was their turn, it passes to whoever comes next. The deck is untouched. */
export function removePlayer(t: Table, name: string): Table {
  const i = t.players.findIndex((p) => p.name === name)
  if (i < 0) return t
  const players = t.players.filter((_, k) => k !== i)
  if (!players.length) return { ...t, players, seat: 0, queen: t.queen === name ? null : t.queen }
  let seat = t.seat
  if (i < t.seat) seat -= 1
  else if (i === t.seat) seat = t.dir === 1 ? i % players.length : (i - 1 + players.length) % players.length
  seat = Math.min(seat, players.length - 1)
  // The new current player may be away.
  if (t.phase === 'down' && players[seat].afk) seat = nextSeat(players, seat, t.dir)
  return { ...t, players, seat, queen: t.queen === name ? null : t.queen }
}

// ---------- helpers ----------

/** Stay on `seat` if that player is here, else move on to the next one who is. */
function settle(players: readonly Player[], seat: number, dir: 1 | -1) {
  if (!players.length) return 0
  const s = Math.min(Math.max(seat, 0), players.length - 1)
  return players[s].afk ? nextSeat(players, s, dir) : s
}

function push(undo: Memento[], t: Table): Memento[] {
  const { players, ...rest } = t
  return [...undo, { ...rest, seatName: players[t.seat]?.name ?? null }].slice(-UNDO_MAX)
}

// ---------- saved data ----------

const isRule = (r: unknown) => !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).title === 'string' && typeof (r as Record<string, unknown>).text === 'string'

/** Accepts sets saved before #126 too (they had `penalty` and `who`; extra fields are ignored). */
export function isRuleSet(raw: unknown): raw is RuleSet {
  if (!raw || typeof raw !== 'object') return false
  const x = raw as Record<string, unknown>
  if (typeof x.id !== 'string' || typeof x.name !== 'string' || typeof x.always !== 'string') return false
  const rules = x.rules as Record<string, unknown> | undefined
  return !!rules && RANKS.every((r) => isRule(rules[r]))
}

export function isTable(raw: unknown): raw is Table {
  if (!raw || typeof raw !== 'object') return false
  const x = raw as Record<string, unknown>
  return (
    typeof x.setId === 'string' &&
    (x.decks === 1 || x.decks === 2) &&
    Array.isArray(x.players) &&
    Array.isArray(x.deck) &&
    x.deck.length === (x.decks as number) * 52 &&
    typeof x.drawn === 'number' &&
    (x.phase === 'shuffling' || x.phase === 'down' || x.phase === 'up') &&
    Array.isArray(x.history) &&
    Array.isArray(x.kRules)
  )
}

export const copySet = (set: RuleSet, id: string, name: string): RuleSet => ({ id, name, always: set.always, rules: { ...set.rules } })

export type { Memento }
