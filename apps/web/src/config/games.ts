// Every game, shown in the "เกม" section on Explore and on /games (DECISIONS #73).
// To add a game: one entry here + `games.list.<id>.title/.desc` in th.ts and en.ts.
import { Bomb, Brush, Fingerprint, Flag, CupSoda, Dices, Eye, Gauge, Grid3x3, Hand, LoaderPinwheel, MessageSquareOff, Pointer, Smartphone, Sparkles, VenetianMask, type LucideIcon } from 'lucide-react'

import headsUpArt from '@/assets/games/headsUp.webp'
import spyArt from '@/assets/games/spy.webp'
import insiderArt from '@/assets/games/insider.webp'
import spectrumArt from '@/assets/games/spectrum.webp'
import codewordsArt from '@/assets/games/codewords.webp'
import tabooArt from '@/assets/games/taboo.webp'
import drawArt from '@/assets/games/draw.webp'
import bombArt from '@/assets/games/bomb.webp'
import mostLikelyArt from '@/assets/games/mostLikely.webp'
import neverHaveArt from '@/assets/games/neverHave.webp'
import diceArt from '@/assets/games/dice.webp'
import cupsArt from '@/assets/games/cups.webp'
import wheelArt from '@/assets/games/wheel.webp'
import fortuneArt from '@/assets/games/fortune.webp'
import fingerArt from '@/assets/games/finger.webp'
import raceArt from '@/assets/games/race.webp'

export type GameId = 'headsUp' | 'spy' | 'insider' | 'spectrum' | 'codewords' | 'taboo' | 'draw' | 'bomb' | 'mostLikely' | 'neverHave' | 'dice' | 'cups' | 'wheel' | 'fortune' | 'finger' | 'race'

/** How it is played: one phone passed around the group, alone, or each friend on their own phone (rooms). */
export type GameMode = 'onePhone' | 'solo' | 'rooms'

/** Section on /games (#92): party games, board-game style games, and toys / luck. */
export type GameKind = 'party' | 'board' | 'toy'

export type Game = {
  id: GameId
  kind: GameKind
  icon: LucideIcon
  /** Category color 1–8 (lib/tones tint). */
  tint: number
  /** Earth's sticker for the game (image/17-game-stickers.png, cut by tools/pet-art/grid.py). */
  art: string
  mode: GameMode
  /** Also playable with each friend on their own phone (room, DECISIONS #76). The card then shows both tags and asks which way. */
  rooms?: boolean
  players: [min: number, max: number]
  status: 'ready' | 'soon'
  to: string
}

export const GAMES: Game[] = [
  { id: 'headsUp', kind: 'party', icon: Smartphone, art: headsUpArt, tint: 8, mode: 'onePhone', players: [2, 20], status: 'ready', to: '/head-guess' },
  { id: 'spy', kind: 'board', icon: VenetianMask, art: spyArt, tint: 6, mode: 'onePhone', rooms: true, players: [3, 12], status: 'ready', to: '/games/spy' },
  { id: 'insider', kind: 'board', icon: Eye, art: insiderArt, tint: 7, mode: 'onePhone', players: [4, 12], status: 'ready', to: '/games/insider' },
  { id: 'spectrum', kind: 'board', icon: Gauge, art: spectrumArt, tint: 8, mode: 'onePhone', players: [2, 12], status: 'ready', to: '/games/spectrum' },
  { id: 'codewords', kind: 'board', icon: Grid3x3, art: codewordsArt, tint: 2, mode: 'onePhone', players: [4, 12], status: 'ready', to: '/games/codewords' },
  { id: 'taboo', kind: 'party', icon: MessageSquareOff, art: tabooArt, tint: 1, mode: 'onePhone', players: [4, 20], status: 'ready', to: '/games/taboo' },
  { id: 'draw', kind: 'party', icon: Brush, art: drawArt, tint: 2, mode: 'onePhone', players: [2, 20], status: 'ready', to: '/games/draw' },
  { id: 'bomb', kind: 'party', icon: Bomb, art: bombArt, tint: 3, mode: 'onePhone', players: [2, 20], status: 'ready', to: '/games/bomb' },
  { id: 'mostLikely', kind: 'party', icon: Pointer, art: mostLikelyArt, tint: 5, mode: 'onePhone', rooms: true, players: [3, 20], status: 'ready', to: '/games/most-likely' },
  { id: 'neverHave', kind: 'party', icon: Hand, art: neverHaveArt, tint: 7, mode: 'onePhone', rooms: true, players: [2, 20], status: 'ready', to: '/games/never' },
  { id: 'dice', kind: 'toy', icon: Dices, art: diceArt, tint: 4, mode: 'onePhone', players: [1, 20], status: 'ready', to: '/games/dice' },
  { id: 'cups', kind: 'toy', icon: CupSoda, art: cupsArt, tint: 6, mode: 'solo', players: [1, 1], status: 'ready', to: '/games/cups' },
  { id: 'finger', kind: 'toy', icon: Fingerprint, art: fingerArt, tint: 5, mode: 'onePhone', players: [2, 10], status: 'ready', to: '/games/finger' },
  { id: 'race', kind: 'toy', icon: Flag, art: raceArt, tint: 7, mode: 'onePhone', players: [2, 8], status: 'ready', to: '/games/race' },
  { id: 'wheel', kind: 'toy', icon: LoaderPinwheel, art: wheelArt, tint: 3, mode: 'solo', players: [1, 20], status: 'ready', to: '/wheel' },
  { id: 'fortune', kind: 'toy', icon: Sparkles, art: fortuneArt, tint: 4, mode: 'solo', players: [1, 1], status: 'ready', to: '/fortune' },
]

export const gameById = (id: GameId) => GAMES.find((g) => g.id === id)!
