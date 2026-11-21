import type { RacerId } from './logic'
import { cn } from '@/lib/utils'

/** Tint (lib/tones, via CSS var) of each racer, used until Earth's art arrives and as the lane colour after. */
const RACER_TINT: Record<RacerId, number> = { cat: 1, shiba: 3, bunny: 5, duck: 7, frog: 2, penguin: 6, panda: 4, koala: 8 }

/** Art per racer (Earth's sticker sheet, #103). Empty until the pictures arrive: the round placeholder is drawn. */
const RACER_ART: Partial<Record<RacerId, string>> = {}

// One racer: Earth's animal picture when there is one, otherwise a round body in the racer's colour with the player's
// number and two little legs. `running` makes it bob and kick.
export function RaceRunner({ racer, initial, running = false, className }: { racer: RacerId; initial: string; running?: boolean; className?: string }) {
  const art = RACER_ART[racer]
  return (
    <span aria-hidden="true" className={cn('race-runner relative block size-12', running && 'is-running', className)}>
      {art ? (
        <img src={art} alt="" className="size-full object-contain" draggable={false} />
      ) : (
        <>
          <span className="race-leg race-leg-a" style={{ background: `var(--tint-${RACER_TINT[racer]})` }} />
          <span className="race-leg race-leg-b" style={{ background: `var(--tint-${RACER_TINT[racer]})` }} />
          <span
            className="race-body grid size-full place-items-center rounded-full font-heading text-lg font-bold ring-3 ring-ink/80"
            style={{ background: `var(--tint-${RACER_TINT[racer]})`, color: `var(--tint-${RACER_TINT[racer]}-foreground)` }}
          >
            {initial}
          </span>
        </>
      )}
    </span>
  )
}
