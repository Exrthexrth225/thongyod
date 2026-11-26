import { randomInt } from 'node:crypto'
import type { InfluenceCard, InvestorTeam } from '@thongyod/shared'

const teams: InvestorTeam[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
const boardSize = 16
type RandomIndex = (upperBound: number) => number

function shuffled<T>(items: T[], randomIndex: RandomIndex): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function influenceDeck(): InfluenceCard[] {
  const deck: InfluenceCard[] = []
  for (const team of teams) {
    for (let i = 0; i < 4; i++) deck.push({ kind: 'team', team })
    for (let i = 0; i < 3; i++) deck.push({ kind: 'travel', team })
  }
  for (let i = 0; i < 3; i++) deck.push({ kind: 'travel', team: 'any' })
  for (let i = 0; i < 33; i++) deck.push({ kind: 'recruit' })
  for (let i = 0; i < 10; i++) deck.push({ kind: 'boss' }, { kind: 'stop' })
  return deck
}

/** Server-only state. Never serialize the deck or another seat's hand to a client. */
export function prepareTable(seatIds: readonly string[], randomIndex: RandomIndex = randomInt) {
  if (seatIds.length < 3 || seatIds.length > 6 || new Set(seatIds).size !== seatIds.length) {
    throw new RangeError('Expected three to six distinct seats')
  }
  const available = shuffled(teams, randomIndex)
  const deck = shuffled(influenceDeck(), randomIndex)
  const seats = seatIds.map(id => ({
    id, investors: available.splice(0, seatIds.length === 3 ? 2 : 1),
    cash: 0, hand: deck.splice(0, 5),
  }))
  const first = randomIndex(seats.length)
  return {
    seats, deck, available, firstPlayer: seats[first].id,
    markerChooser: seats[(first + seats.length - 1) % seats.length].id,
  }
}

/** Only open spaces count, including when movement wraps past space fifteen. */
export function advanceMarker(position: number, steps: number, closed: ReadonlySet<number>): number {
  const onBoard = (space: number) => Number.isInteger(space) && space >= 0 && space < boardSize
  if (!onBoard(position) || !Number.isInteger(steps) || steps < 1 || steps > 6 ||
      closed.size >= boardSize || [...closed].some(space => !onBoard(space))) {
    throw new RangeError('Invalid board movement')
  }
  for (let remaining = steps; remaining > 0;) {
    position = (position + 1) % boardSize
    if (!closed.has(position)) remaining--
  }
  return position
}
