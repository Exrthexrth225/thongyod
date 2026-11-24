// Tools shown as cards on the "ทำอะไรดี" (Explore) page. Games live in config/games.ts (#73).
// To add a feature: add one entry here + its texts in i18n (tools.<id>.title / .desc).
// status: 'ready'  = card opens `to` (page may still be a placeholder while being built)
//         'soon'   = locked card labelled "เร็วๆ นี้" (later versions)
import {
  Calculator,
  CalendarDays,
  CalendarPlus,
  CheckSquare,
  Layers,
  PawPrint,
  Palette,
  Receipt,
  Shuffle,
  Timer,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react'
import { PETS_ENABLED } from '@/config/features'

const TOOL_ART = import.meta.glob<string>('@/assets/tools/*.webp', { eager: true, import: 'default' })
const toolArt = (name: string) => TOOL_ART[`/src/assets/tools/${name}.webp`]

export type ToolId =
  | 'createMeetup'
  | 'quickVote'
  | 'restaurantVote'
  | 'splitBill'
  | 'randomRestaurant'
  | 'playPet'
  | 'luckyColor'
  | 'myMeetups'
  | 'gradeCalculator'
  | 'focusTimer'
  | 'flashcards'

export type Tool = {
  id: ToolId
  icon: LucideIcon
  group: 'friends' | 'solo'
  status: 'ready' | 'soon'
  /** Route path. Required when status is 'ready'. */
  to?: string
  /** Shown as the big highlighted card at the top of its group. */
  featured?: boolean
  /** Colour block of its icon (lib/tones tint 1–8, #97). */
  tint: number
  /** Sticker from image/53-tool-stickers.png (#132); the line icon stays for small places. */
  art?: string
}

const ALL_TOOLS: Tool[] = [
  { id: 'createMeetup', icon: CalendarPlus, group: 'friends', status: 'ready', to: '/meetups/new', featured: true, art: toolArt('invite'), tint: 3 },
  { id: 'quickVote', icon: CheckSquare, group: 'friends', status: 'ready', to: '/quick-vote', art: toolArt('quickVote'), tint: 5 },
  { id: 'restaurantVote', icon: ThumbsUp, group: 'friends', status: 'ready', to: '/restaurant-vote', art: toolArt('foodVote'), tint: 2 },
  { id: 'splitBill', icon: Receipt, group: 'friends', status: 'ready', to: '/bills', art: toolArt('bill'), tint: 1 },
  { id: 'randomRestaurant', icon: Shuffle, group: 'solo', status: 'ready', to: '/random-restaurant', art: toolArt('randomFood'), tint: 2 },
  { id: 'playPet', icon: PawPrint, group: 'solo', status: 'ready', to: '/pet', tint: 1 },
  { id: 'luckyColor', icon: Palette, group: 'solo', status: 'ready', to: '/lucky-color', art: toolArt('luckyColor'), tint: 4 },
  { id: 'myMeetups', icon: CalendarDays, group: 'solo', status: 'ready', to: '/plan', art: toolArt('noPlans'), tint: 5 },
  { id: 'gradeCalculator', icon: Calculator, group: 'solo', status: 'soon', tint: 3 },
  { id: 'focusTimer', icon: Timer, group: 'solo', status: 'soon', tint: 6 },
  { id: 'flashcards', icon: Layers, group: 'solo', status: 'ready', to: '/flashcards', art: toolArt('flashcards'), tint: 8 },
]

/** Every tool the app shows; the pet tile is hidden while PETS_ENABLED is off (#132). */
export const TOOLS: Tool[] = ALL_TOOLS.filter((tool) => PETS_ENABLED || tool.id !== 'playPet')
