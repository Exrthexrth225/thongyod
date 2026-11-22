import type { Ref } from 'react'
import sparkle from '@/assets/fortune/sparkle.webp'
import bee from '@/assets/race-props/bee.webp'
import exclaim from '@/assets/race-props/exclaim.webp'
import peel from '@/assets/race-props/peel.webp'
import question from '@/assets/race-props/question.webp'
import rock from '@/assets/race-props/rock.webp'
import zzz from '@/assets/race-props/zzz.webp'

// Little pictures for race events (#114), Earth's prop sheet image/28-race-props.png. race.css shows each one only
// while its event is on (data-ev on the runner's slot).
/** On the runner: dizzy stars (trip), Zzz (nap), a question mark (wrong way), a bee + "!" + speed lines (bee). */
export function RaceFx() {
  return (
    <>
      <span className="race-fx race-fx-stars" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <img key={i} src={sparkle} alt="" draggable={false} style={{ animationDelay: `${i * -0.23}s` }} />
        ))}
      </span>
      <img src={zzz} alt="" className="race-fx race-fx-z" draggable={false} />
      <img src={question} alt="" className="race-fx race-fx-q" draggable={false} />
      <img src={exclaim} alt="" className="race-fx race-fx-ex" draggable={false} />
      <img src={bee} alt="" className="race-fx race-fx-bee" draggable={false} />
      <span className="race-fx race-fx-lines" aria-hidden="true" />
    </>
  )
}

/** A rock or a banana peel lying in the lane, placed (left) and shown (data-on) by the race loop. */
export function RaceProp({ kind, ref }: { kind: 'trip' | 'banana' | 'prank'; ref?: Ref<HTMLSpanElement> }) {
  return (
    <span ref={ref} className={kind === 'prank' ? 'race-prop is-thrown' : 'race-prop'} aria-hidden="true">
      <img src={kind === 'trip' ? rock : peel} alt="" className="size-full object-contain" draggable={false} />
    </span>
  )
}
