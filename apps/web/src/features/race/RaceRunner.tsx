import catRun1 from '@/assets/racers/cat.webp'
import catRun2 from '@/assets/racers-run2/cat.webp'
import catWin from '@/assets/racers-win/cat.webp'
import shibaRun1 from '@/assets/racers/shiba.webp'
import shibaRun2 from '@/assets/racers-run2/shiba.webp'
import shibaWin from '@/assets/racers-win/shiba.webp'
import bunnyRun1 from '@/assets/racers/bunny.webp'
import bunnyRun2 from '@/assets/racers-run2/bunny.webp'
import bunnyWin from '@/assets/racers-win/bunny.webp'
import duckRun1 from '@/assets/racers/duck.webp'
import duckRun2 from '@/assets/racers-run2/duck.webp'
import duckWin from '@/assets/racers-win/duck.webp'
import frogRun1 from '@/assets/racers/frog.webp'
import frogRun2 from '@/assets/racers-run2/frog.webp'
import frogWin from '@/assets/racers-win/frog.webp'
import penguinRun1 from '@/assets/racers/penguin.webp'
import penguinRun2 from '@/assets/racers-run2/penguin.webp'
import penguinWin from '@/assets/racers-win/penguin.webp'
import pandaRun1 from '@/assets/racers/panda.webp'
import pandaRun2 from '@/assets/racers-run2/panda.webp'
import pandaWin from '@/assets/racers-win/panda.webp'
import koalaRun1 from '@/assets/racers/koala.webp'
import koalaRun2 from '@/assets/racers-run2/koala.webp'
import koalaWin from '@/assets/racers-win/koala.webp'
import type { RacerId } from './logic'
import { cn } from '@/lib/utils'

/** Tint (lib/tones, via CSS var) of each racer, used until Earth's art arrives and as the lane colour after. */
const RACER_TINT: Record<RacerId, number> = { cat: 1, shiba: 3, bunny: 5, duck: 7, frog: 2, penguin: 6, panda: 4, koala: 8 }

/** Art per racer (Earth's sheet image/18-racers.png, cut by tools/pet-art/grid.py, #103). */
const RACER_ART: Partial<Record<RacerId, { run: [string, string]; win: string }>> = {
  cat: { run: [catRun1, catRun2], win: catWin },
  shiba: { run: [shibaRun1, shibaRun2], win: shibaWin },
  bunny: { run: [bunnyRun1, bunnyRun2], win: bunnyWin },
  duck: { run: [duckRun1, duckRun2], win: duckWin },
  frog: { run: [frogRun1, frogRun2], win: frogWin },
  penguin: { run: [penguinRun1, penguinRun2], win: penguinWin },
  panda: { run: [pandaRun1, pandaRun2], win: pandaWin },
  koala: { run: [koalaRun1, koalaRun2], win: koalaWin },
}

// One racer: Earth's animal (two running frames flipped like a flipbook while it runs, a cheering pose when it wins),
// otherwise a round body in the racer's colour with the player's number and two little legs.
export function RaceRunner({ racer, initial, running = false, won = false, className }: { racer: RacerId; initial: string; running?: boolean; won?: boolean; className?: string }) {
  const art = RACER_ART[racer]
  return (
    <span aria-hidden="true" className={cn('race-runner relative block size-12', running && 'is-running', className)}>
      {art ? (
        won ? (
          <img src={art.win} alt="" className="race-win size-full object-contain" draggable={false} />
        ) : (
          <>
            <img src={art.run[0]} alt="" className={cn('absolute inset-0 size-full object-contain', running && 'race-frame-a')} draggable={false} />
            <img src={art.run[1]} alt="" className={cn('absolute inset-0 size-full object-contain opacity-0', running && 'race-frame-b')} draggable={false} />
          </>
        )
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
