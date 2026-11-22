import { Club, Diamond, Heart, Spade, type LucideIcon } from 'lucide-react'
import type { Rank, Suit } from '@/config/games/fatCat'
import { cn } from '@/lib/utils'
import './games.css'

const SUIT_ICON: Record<Suit, LucideIcon> = { spade: Spade, heart: Heart, diamond: Diamond, club: Club }
const RED: readonly Suit[] = ['heart', 'diamond']

// A real playing-card face (#123, แมวอ้วง): rank in two corners and the suit big in the middle. Red suits use the
// danger tone so they follow the theme. `className` sets the size (keep the 5:7 shape).
export function PlayingCard({ rank, suit, label, className }: { rank: Rank; suit: Suit; label: string; className?: string }) {
  const Icon = SUIT_ICON[suit]
  const red = RED.includes(suit)
  const corner = (
    <span className="flex flex-col items-center leading-none">
      <span className="font-heading text-[1.6em] font-bold">{rank}</span>
      <Icon className="size-[1.1em]" fill="currentColor" aria-hidden="true" />
    </span>
  )
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('game-card-in relative aspect-[5/7] rounded-[1.1em] border bg-card p-[0.6em] text-[clamp(14px,4.5vw,20px)] shadow-md', red ? 'text-tone-danger-foreground' : 'text-foreground', className)}
    >
      <span className="absolute top-[0.6em] left-[0.6em]">{corner}</span>
      <span className="absolute right-[0.6em] bottom-[0.6em] rotate-180">{corner}</span>
      <span className="grid size-full place-items-center">
        <Icon className="size-[45%]" fill="currentColor" strokeWidth={1.25} aria-hidden="true" />
      </span>
    </div>
  )
}
