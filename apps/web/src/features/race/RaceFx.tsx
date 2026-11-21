import type { Ref } from 'react'
import sparkle from '@/assets/fortune/sparkle.webp'

// Little drawings for race events (#114). Simple shapes drawn here until Earth's prop sheet arrives
// (image/28-race-props.png); race.css shows each one only while its event is on (data-ev on the runner's slot).
const OUTLINE = { stroke: '#3a2416', strokeWidth: 2.2, strokeLinejoin: 'round' as const }

function Bee() {
  return (
    <svg viewBox="0 0 40 32" className="size-full">
      <ellipse cx="17" cy="7" rx="7" ry="5" fill="#dff3ff" {...OUTLINE} />
      <ellipse cx="25" cy="8" rx="6" ry="4.5" fill="#dff3ff" {...OUTLINE} />
      <ellipse cx="21" cy="19" rx="13" ry="10" fill="#ffc21a" {...OUTLINE} />
      <path d="M17 10 Q15 19 17 28 M24 10 Q22 19 24 28" stroke="#3a2416" strokeWidth="3" fill="none" />
      <circle cx="30" cy="17" r="1.6" fill="#3a2416" />
    </svg>
  )
}

/** Drawn on the runner: dizzy stars (trip), Zzz (nap), a question mark (wrong way), a bee + speed lines (bee). */
export function RaceFx() {
  return (
    <>
      <span className="race-fx race-fx-stars" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <img key={i} src={sparkle} alt="" draggable={false} style={{ animationDelay: `${i * -0.23}s` }} />
        ))}
      </span>
      <span className="race-fx race-fx-z font-heading" aria-hidden="true">
        <b>z</b>
        <b>z</b>
        <b>Z</b>
      </span>
      <span className="race-fx race-fx-q font-heading" aria-hidden="true">
        ?
      </span>
      <span className="race-fx race-fx-bee" aria-hidden="true">
        <Bee />
      </span>
      <span className="race-fx race-fx-lines" aria-hidden="true" />
    </>
  )
}

/** A rock or a banana peel lying in the lane, placed (left) and shown (data-on) by the race loop. */
export function RaceProp({ kind, ref }: { kind: 'trip' | 'banana' | 'prank'; ref?: Ref<HTMLSpanElement> }) {
  return (
    <span ref={ref} className={kind === 'prank' ? 'race-prop is-thrown' : 'race-prop'} aria-hidden="true">
      {kind === 'trip' ? (
        <svg viewBox="0 0 40 28" className="size-full">
          <path d="M4 24 Q2 14 10 9 Q16 3 25 5 Q35 7 37 16 Q38 24 30 25 Z" fill="#b9b3c4" {...OUTLINE} />
          <path d="M19 9 L22 14 L19 17" fill="none" stroke="#3a2416" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="14" cy="11" rx="4" ry="2" fill="#fff" opacity="0.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 40 28" className="size-full">
          <path d="M20 16 Q10 4 3 12 Q9 15 16 19 Q8 24 9 26 Q16 24 20 20 Q25 25 32 26 Q32 22 24 18 Q31 14 37 11 Q29 5 20 16 Z" fill="#ffd84a" {...OUTLINE} />
          <circle cx="20" cy="17" r="2.6" fill="#a8722e" />
        </svg>
      )}
    </span>
  )
}
