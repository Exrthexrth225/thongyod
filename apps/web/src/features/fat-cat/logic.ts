// แมวอ้วง (#123): the deck, the seats, and what the app remembers for the circle (queen, scarf buddies, king rule,
// who got hit how many times). Pure functions; the screen keeps one `Hand` and saves it, so going off to play a
// quick game for the 9 and coming back carries on where it was.
import { MAX_PICKS, RANKS, SUITS, WHO, type Rank, type Rule, type RuleSet, type Suit } from '@/config/games/fatCat'
import { shuffle } from '@/lib/random'

export type Card = { rank: Rank; suit: Suit }
export const DECK_SIZE = RANKS.length * SUITS.length

export const fullDeck = (): Card[] => SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })))

// Seats are listed going round to the left: the next player (next turn) sits on your left.
export const leftOf = (n: number, i: number) => (i + 1) % n
export const rightOf = (n: number, i: number) => (i - 1 + n) % n

export type Hand = {
  setId: string
  /** Names in seat order; empty = played without names (the app only shows the cards). */
  players: string[]
  deck: Card[]
  /** Cards already opened; the open card is deck[drawn - 1] while `open`. */
  drawn: number
  open: boolean
  /** Whose turn (index into players). */
  turn: number
  queen: string | null
  /** Scarf wearers, in the order they lost the 7: all of them are buddies and get hit together. */
  scarves: string[]
  kRule: string | null
  tally: Record<string, number>
  /** Times the deck was shuffled again. */
  round: number
}

export function startHand(setId: string, players: string[], random?: (max: number) => number): Hand {
  return { setId, players, deck: shuffle(fullDeck(), random), drawn: 0, open: false, turn: 0, queen: null, scarves: [], kRule: null, tally: {}, round: 1 }
}

export const drawer = (h: Hand) => (h.players.length ? h.players[h.turn % h.players.length] : null)
export const openCard = (h: Hand) => (h.open ? h.deck[h.drawn - 1] : null)
export const cardsLeft = (h: Hand) => h.deck.length - h.drawn
export const deckDone = (h: Hand) => !h.open && h.drawn >= h.deck.length

export function flip(h: Hand): Hand {
  if (h.open || h.drawn >= h.deck.length) return h
  return { ...h, drawn: h.drawn + 1, open: true }
}

/** Who the card names straight away, and how many the opener picks (-1 = any number, for the king rule). */
export function targetsFor(rule: Rule, h: Hand): { names: string[]; choose: number } {
  const n = h.players.length
  if (!n) return { names: [], choose: 0 }
  const me = h.turn % n
  switch (rule.who) {
    case 'self':
      return { names: [h.players[me]], choose: 0 }
    case 'left':
      return { names: [h.players[leftOf(n, me)]], choose: 0 }
    case 'right':
      return { names: [h.players[rightOf(n, me)]], choose: 0 }
    case 'all':
      return { names: [...h.players], choose: 0 }
    case 'pick':
      return { names: [], choose: Math.min(Math.max(rule.picks ?? 1, 1), MAX_PICKS, n) }
    case 'duel':
    case 'game':
      return { names: [], choose: 1 }
    case 'king':
      return { names: [], choose: -1 }
    default:
      return { names: [], choose: 0 }
  }
}

/** A scarf wearer is never hit alone: their buddies come too. */
export function withBuddies(names: readonly string[], scarves: readonly string[]): string[] {
  const out = [...new Set(names)]
  if (out.some((x) => scarves.includes(x))) for (const s of scarves) if (!out.includes(s)) out.push(s)
  return out
}

export function addScarf(scarves: readonly string[], loser: string): string[] {
  return scarves.includes(loser) ? [...scarves] : [...scarves, loser]
}

/**
 * Close the open card. `hit` = who got hit (buddies are added), `loser` = the 7's loser (scarf), `kRule` = a new
 * king rule. The opener of a Q becomes queen. Then it is the next player's turn.
 */
export function resolve(h: Hand, rule: Rule, out: { hit?: string[]; loser?: string; kRule?: string }): Hand {
  if (!h.open) return h
  const me = drawer(h)
  let next: Hand = { ...h, open: false, turn: h.players.length ? (h.turn + 1) % h.players.length : 0 }
  if (rule.who === 'queen' && me) next.queen = me
  if (rule.who === 'duel' && out.loser) next.scarves = addScarf(h.scarves, out.loser)
  if (rule.who === 'king' && out.kRule !== undefined) next.kRule = out.kRule.trim() || null
  const hit = withBuddies(out.hit ?? [], next.scarves)
  if (hit.length) {
    const tally = { ...h.tally }
    for (const name of hit) tally[name] = (tally[name] ?? 0) + 1
    next = { ...next, tally }
  }
  return next
}

/** A fresh shuffle when the deck runs out; the queen, scarves, king rule and counts stay. */
export function reshuffle(h: Hand, random?: (max: number) => number): Hand {
  return { ...h, deck: shuffle(fullDeck(), random), drawn: 0, open: false, round: h.round + 1 }
}

/** Most hits first (ties by seat). */
export function standings(h: Hand) {
  return h.players.map((name, seat) => ({ name, seat, hits: h.tally[name] ?? 0 })).sort((a, b) => b.hits - a.hits || a.seat - b.seat)
}

// ---------- rule sets kept on this phone ----------

const isRule = (r: unknown): r is Rule => {
  if (!r || typeof r !== 'object') return false
  const x = r as Record<string, unknown>
  return typeof x.title === 'string' && typeof x.text === 'string' && (WHO as readonly unknown[]).includes(x.who) && (x.picks === undefined || typeof x.picks === 'number')
}

export function isRuleSet(raw: unknown): raw is RuleSet {
  if (!raw || typeof raw !== 'object') return false
  const x = raw as Record<string, unknown>
  if (typeof x.id !== 'string' || typeof x.name !== 'string' || typeof x.penalty !== 'string' || typeof x.always !== 'string') return false
  const rules = x.rules as Record<string, unknown> | undefined
  return !!rules && RANKS.every((r) => isRule(rules[r]))
}

export const isHand = (raw: unknown): raw is Hand => {
  if (!raw || typeof raw !== 'object') return false
  const x = raw as Record<string, unknown>
  return (
    typeof x.setId === 'string' &&
    Array.isArray(x.players) &&
    Array.isArray(x.deck) &&
    x.deck.length === DECK_SIZE &&
    typeof x.drawn === 'number' &&
    typeof x.turn === 'number' &&
    Array.isArray(x.scarves) &&
    !!x.tally &&
    typeof x.tally === 'object'
  )
}

export const copySet = (set: RuleSet, id: string, name: string): RuleSet => ({ ...set, id, name, rules: { ...set.rules } })
