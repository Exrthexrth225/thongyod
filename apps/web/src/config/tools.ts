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
}

export const TOOLS: Tool[] = [
  { id: 'createMeetup', icon: CalendarPlus, group: 'friends', status: 'ready', to: '/meetups/new', featured: true, tint: 3 },
  { id: 'quickVote', icon: CheckSquare, group: 'friends', status: 'ready', to: '/quick-vote', tint: 5 },
  { id: 'restaurantVote', icon: ThumbsUp, group: 'friends', status: 'ready', to: '/restaurant-vote', tint: 2 },
  { id: 'splitBill', icon: Receipt, group: 'friends', status: 'ready', to: '/bills', tint: 1 },
  { id: 'randomRestaurant', icon: Shuffle, group: 'solo', status: 'ready', to: '/random-restaurant', tint: 2 },
  { id: 'playPet', icon: PawPrint, group: 'solo', status: 'ready', to: '/pet', tint: 1 },
  { id: 'luckyColor', icon: Palette, group: 'solo', status: 'ready', to: '/lucky-color', tint: 4 },
  { id: 'myMeetups', icon: CalendarDays, group: 'solo', status: 'ready', to: '/meetups', tint: 5 },
  { id: 'gradeCalculator', icon: Calculator, group: 'solo', status: 'soon', tint: 3 },
  { id: 'focusTimer', icon: Timer, group: 'solo', status: 'soon', tint: 6 },
  { id: 'flashcards', icon: Layers, group: 'solo', status: 'ready', to: '/flashcards', tint: 8 },
]
