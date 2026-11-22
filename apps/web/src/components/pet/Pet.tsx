import heart from '@/assets/effects/heart.webp'
import heartRed from '@/assets/effects/heartRed.webp'
import spark from '@/assets/effects/spark.webp'
import sparkSmall from '@/assets/effects/sparkSmall.webp'
import cloud from '@/assets/effects/cloud.webp'
import cloudSmall from '@/assets/effects/cloudSmall.webp'
import bubble from '@/assets/effects/bubble.webp'
import bubbleBig from '@/assets/effects/bubbleBig.webp'
import crumb1 from '@/assets/effects/crumb1.webp'
import crumb2 from '@/assets/effects/crumb2.webp'
import crumb3 from '@/assets/effects/crumb3.webp'
import anger from '@/assets/effects/anger.webp'
import zzz from '@/assets/race-props/zzz.webp'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BLINK_MS,
  EAT_FLIP,
  FIDGETS,
  LONG_PRESS_MS,
  POSES,
  TAP_ACTIONS,
  blinkDelayMs,
  idleDelayMs,
  PLAY_ACTIONS,
  pickIdle,
  pickOther,
  planFor,
  sleepAfterMs,
  type Overlay,
  type PetAction,
  type PoseId,
} from '@/features/pet/behavior'
import { CELEBRATE_EVENT, CHEER_EVENT, celebrationDue, markCelebrated } from '@/features/pet/celebrate'
import { MOTIONS } from '@/features/pet/motions'
import { initialTaps, tap } from '@/features/pet/taps'
import { GREW_EVENT, STAGE_SCALE, useGrowth } from '@/features/pet/growth'
import { cn } from '@/lib/utils'
import { hasOwnArt, PET_SPECIES, posesFor, type PetSpeciesId } from './species'
import './pet.css'

// The pet (DECISIONS #47, #80, UX_GUIDELINES §2). Three layers that never fight each other:
// 1. "alive" (CSS, always): breathing or floating.
// 2. "move" (Web Animations, one-shot): hop, fly, turn, sneeze, dance… from features/pet/motions.ts.
// 3. pose images: all 12 are mounted and decoded up front and swap instantly at the squashed moment of a move
//    (or the thinnest moment of a turn), like cartoon frames: never two drawings at once, never a flash.
// Blinking = a separate eyes-closed layer over the main pose (same pixels except the eyes).

/** Anything a parent can trigger (pet page buttons, celebrations). */
export type PetAct = PetAction | 'idle'
/** `food`: what it is eating (#120). A cookie plays Earth's cookie flipbook; anything else is held and bitten. */
export type PetHandle = { run: (act: PetAct, opts?: { food?: string; isCookie?: boolean }) => void }

type PetProps = {
  species: PetSpeciesId
  /** Whole footprint width in px (room for every move is inside it). */
  size?: number
  ref?: Ref<PetHandle>
  className?: string
  /** Called when the user taps the pet (after its own reaction starts). */
  onTap?: () => void
  /** Night (#119): the pet sleeps; a tap only makes it yawn and go back to sleep. */
  nightMode?: boolean
  /** Sad (a need is low, #119): no playful idle moves, only small fidgets and yawns; rests on the sad drawing. */
  mood?: 'happy' | 'ok' | 'sad'
  /** In the bath (#120): sits in the foam (bath drawing) and stays put. */
  bathing?: boolean
  /** Walking across the room (#121): a walk cycle facing that way (the page moves the pet). */
  walking?: false | 'left' | 'right'
  /** How the user touched it (#121), after its own reaction starts: for bond points and wishes. */
  onTouch?: (kind: TouchKind) => void
}

export type TouchKind = 'tap' | 'pat' | 'tickle' | 'poke' | 'hug'
/** Where on the art (0–1) a touch landed. Head = top part; face = around the mouth; belly = lower middle. */
function zoneAt(x: number, y: number, mouth: [number, number]): 'head' | 'face' | 'belly' | 'body' {
  if (Math.hypot(x - mouth[0], (y - mouth[1]) * 1.2) < 0.16) return 'face'
  if (y < 0.4) return 'head'
  if (y > 0.55 && x > 0.2 && x < 0.8) return 'belly'
  return 'body'
}

/**
 * Room around the art for its moves, as a share of the art size: fly/jump go up to 22 % (+ hearts, z above),
 * dash 9 % + small tilts to the sides. Checked frame by frame on phone and tablet sizes (scratch poseboxes check).
 */
const ROOM = { top: 0.36, side: 0.2, bottom: 0.06 }
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const rnd = (n: number) => Math.floor(Math.random() * n)
const eased = (frames: Keyframe[]) => frames.map((k) => ({ ...k, easing: 'ease-in-out' }))

export function Pet({ species, size = 240, ref, className, onTap: onTapProp, nightMode = false, mood = 'happy', bathing = false, walking = false, onTouch }: PetProps) {
  const { t } = useTranslation()
  const spec = PET_SPECIES[species]
  // Baby / teen: their own drawings when the species has them, and smaller (#105).
  const stage = useGrowth().stage
  const stageScale = STAGE_SCALE[stage]
  const poses = posesFor(spec, stage)
  const [pose, setPose] = useState<PoseId>('main')
  const [overlay, setOverlay] = useState<{ name: Overlay; key: number }>({ name: 'none', key: 0 })
  const [blink, setBlink] = useState(false)
  /** Eating flipbook frame on screen (adult with Earth's 4 frames), or null. */
  const [eatFrame, setEatFrame] = useState<number | null>(null)
  const [held, setHeld] = useState<{ src: string; key: number } | null>(null)
  const [asleep, setAsleep] = useState(false)
  const [paused, setPaused] = useState(false)
  const move = useRef<HTMLSpanElement>(null)
  /** Hidden element that only carries the timing clocks, so cancelling the body's moves never cancels them (#113). */
  const clockEl = useRef<HTMLSpanElement>(null)
  /** The pending pose swap of the current move (cancelled when another move starts). */
  const swapClock = useRef<Animation | null>(null)
  const lastFidget = useRef<(typeof FIDGETS)[number] | null>(null)
  const shadow = useRef<HTMLSpanElement>(null)
  const timers = useRef<number[]>([])
  const idleTimer = useRef(0)
  const lastTouch = useRef(0)
  const lastTap = useRef<PetAction | null>(null)
  const lastIdle = useRef<PetAction | null>(null)
  const busy = useRef(false)
  const pressTimer = useRef(0)
  const longPressed = useRef(false)
  const box = useRef<HTMLSpanElement>(null)
  /** The current finger: where it started, how far it went, how often it turned back (tickling). */
  const stroke = useRef<{ x: number; y: number; zone: string; moved: number; turns: number; dir: number; lastX: number; lastY: number; patted: number } | null>(null)
  const poseRef = useRef<PoseId>('main')
  const taps = useRef(initialTaps)
  /** Until when a reaction to a tap (or hug) is playing. Idle moves can be interrupted by a tap, reactions cannot. */
  const reactingUntil = useRef(0)
  const react = (act: PetAction) => {
    reactingUntil.current = Date.now() + planFor(act, spec.moves).ms
    run(act)
  }

  /**
   * Run `fn` after `ms` on the animation clock (an empty Web Animation), not on setTimeout:
   * the pose swap and the end of a move stay in step with the motion even if the browser slows or pauses animations.
   */
  const clocks = useRef<Animation[]>([])
  const after = useCallback((ms: number, fn: () => void): Animation | null => {
    const el = clockEl.current
    if (!el?.animate) {
      timers.current.push(window.setTimeout(fn, ms))
      return null
    }
    const clock = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: ms })
    clocks.current.push(clock)
    clock.finished.then(fn).catch(() => {})
    return clock
  }, [])
  const clearTimers = () => {
    setEatFrame(null)
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    clocks.current.forEach((c) => c.cancel())
    clocks.current = []
  }

  /** Play a move and swap to `next` pose at the move's squashed moment (instantly when motion is reduced). */
  const moveTo = useCallback((next: PoseId, name: keyof typeof MOTIONS | 'none') => {
    const swap = () => {
      poseRef.current = next
      setPose(next)
    }
    const motion = name === 'none' && next !== poseRef.current ? 'settle' : name
    if (motion === 'none' || reducedMotion()) return swap()
    const m = MOTIONS[motion]
    move.current?.getAnimations().forEach((a) => a.cancel())
    shadow.current?.getAnimations().forEach((a) => a.cancel())
    swapClock.current?.cancel()
    swapClock.current = null
    // Easing per key frame (linear overall), so each key frame lands exactly at its offset and the swap timer matches it.
    move.current?.animate(eased(m.frames), { duration: m.ms, easing: 'linear' })
    if (m.shadow) shadow.current?.animate(eased(m.shadow), { duration: m.ms, easing: 'linear' })
    if (next !== poseRef.current) swapClock.current = after(m.ms * m.swapAt, swap)
  }, [after])

  // run() and the idle clock call each other, so both live in refs that are refreshed every render.
  const runRef = useRef<(act: PetAct, opts?: { food?: string; isCookie?: boolean }) => void>(() => {})
  const nightRef = useRef(nightMode)
  const moodRef = useRef(mood)
  const bathingRef = useRef(bathing)
  /** The pose it goes back to after a move: sad when a need is low, the foam in the bath. */
  const rest = (): PoseId => (bathingRef.current ? 'bath' : moodRef.current === 'sad' ? 'sad' : 'main')
  useEffect(() => {
    nightRef.current = nightMode
    moodRef.current = mood
    bathingRef.current = bathing
  })
  const scheduleIdle = useCallback(function schedule() {
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(
      () => {
        if (document.hidden || busy.current || bathingRef.current) return schedule()
        // Night: whatever woke it, it goes back to sleep.
        if (nightRef.current) return runRef.current('sleep')
        const hour = new Date().getHours()
        if (Date.now() - lastTouch.current > sleepAfterMs(hour)) return runRef.current('sleep')
        let next = pickIdle(lastIdle.current, hour, rnd)
        if (moodRef.current === 'sad' && (PLAY_ACTIONS as readonly string[]).includes(next)) next = rnd(2) ? 'fidget' : 'yawn'
        lastIdle.current = next
        runRef.current(next)
      },
      nightRef.current ? 600 : idleDelayMs(rnd),
    )
  }, [])

  const run = useCallback(
    (act: PetAct, opts?: { food?: string; isCookie?: boolean }) => {
      clearTimers()
      if (act === 'idle') {
        busy.current = false
        setAsleep(false)
        setOverlay({ name: 'none', key: Date.now() })
        moveTo(rest(), 'none')
        scheduleIdle()
        return
      }
      let plan = planFor(act, spec.moves)
      if (act === 'fidget') {
        const fid = pickOther(FIDGETS, lastFidget.current, rnd)
        lastFidget.current = fid
        plan = { pose: 'main', ...fid }
      }
      busy.current = true
      // Eating something that is not a cookie (#120): the eat drawings hold a cookie, so it holds the real food in
      // front of its mouth and takes bites out of it on the happy face instead.
      const holding = act === 'eat' && !!opts?.food && !opts.isCookie
      if (holding) {
        plan = { ...plan, pose: 'happy' }
        setHeld({ src: opts.food!, key: Date.now() })
      }
      // Eating a cookie: play Earth's frames (mouth opens, bites, chews twice, smiles) instead of one still drawing (#108).
      const frames = stage === 'adult' ? spec.eatFrames : undefined
      if (act === 'eat' && !holding && frames && !reducedMotion()) {
        for (const step of EAT_FLIP) after(step.at, () => setEatFrame(step.frame))
        after(plan.ms, () => setEatFrame(null))
      }
      setAsleep(act === 'sleep')
      moveTo(plan.pose, plan.motion)
      setOverlay({ name: plan.overlay, key: Date.now() })
      if (plan.ms > 0) {
        after(plan.ms, () => {
          busy.current = false
          setHeld(null)
          moveTo(rest(), 'none')
          setOverlay((o) => ({ ...o, name: 'none' }))
          scheduleIdle()
        })
      } else {
        busy.current = false
        window.clearTimeout(idleTimer.current)
      }
    },
    [after, moveTo, scheduleIdle, spec.moves, spec.eatFrames, stage],
  )
  useEffect(() => {
    runRef.current = run
  })

  // Start living: idle clock, and a celebration if today's missions were finished elsewhere.
  useEffect(() => {
    lastTouch.current = Date.now()
    scheduleIdle()
    const celebrate = () => {
      if (!celebrationDue()) return
      markCelebrated()
      window.setTimeout(() => runRef.current('celebrate'), 500)
    }
    celebrate()
    const cheer = () => {
      lastTouch.current = Date.now()
      runRef.current('happy')
    }
    window.addEventListener(CELEBRATE_EVENT, celebrate)
    window.addEventListener(CHEER_EVENT, cheer)
    window.addEventListener(GREW_EVENT, cheer)
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, celebrate)
      window.removeEventListener(CHEER_EVENT, cheer)
      window.removeEventListener(GREW_EVENT, cheer)
      window.clearTimeout(idleTimer.current)
      clearTimers()
    }
  }, [scheduleIdle])

  // Into / out of the bath, or becoming sad / cheered up: settle on the new resting drawing.
  const restNow: PoseId = bathing ? 'bath' : mood === 'sad' ? 'sad' : 'main'
  useEffect(() => {
    if (busy.current || poseRef.current === restNow) return
    moveTo(restNow, poseRef.current === 'main' && restNow === 'sad' ? 'none' : 'squish')
  }, [restNow, moveTo])

  // Night starts / ends while the page is open.
  const wasNight = useRef(nightMode)
  useEffect(() => {
    if (wasNight.current === nightMode) {
      if (nightMode) runRef.current('sleep')
      return
    }
    wasNight.current = nightMode
    runRef.current(nightMode ? 'sleep' : 'idle')
  }, [nightMode])

  // Decode every pose before it is needed, so the first switch is instant.
  useEffect(() => {
    for (const src of [...POSES.map((p) => poses[p]), ...(spec.eatFrames ?? [])]) {
      const img = new Image()
      img.src = src
      img.decode?.().catch(() => {})
    }
  }, [poses, spec.eatFrames])

  // Blink now and then, only while resting on the main pose.
  useEffect(() => {
    if (pose !== 'main' || asleep) return
    let id = 0
    let open = 0
    const schedule = () => {
      id = window.setTimeout(() => {
        if (!busy.current && !document.hidden) {
          setBlink(true)
          open = window.setTimeout(() => setBlink(false), BLINK_MS)
        }
        schedule()
      }, blinkDelayMs(rnd))
    }
    schedule()
    return () => {
      window.clearTimeout(id)
      window.clearTimeout(open)
      setBlink(false)
    }
  }, [pose, asleep])

  // Stop all motion while the page is hidden (battery).
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useImperativeHandle(ref, () => ({ run: (act, opts) => runRef.current(act, opts) }), [])

  function touched() {
    lastTouch.current = Date.now()
  }
  /** Pointer position on the art box, 0–1. */
  const artPoint = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect()
    return r ? { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } : { x: 0.5, y: 0.5 }
  }
  const touchReact = (kind: TouchKind, act: PetAction) => {
    onTapProp?.()
    onTouch?.(kind)
    if (nightRef.current) return busy.current ? undefined : react('yawn')
    react(act)
  }

  function onPointerDown(e: PointerEvent) {
    touched()
    const p = artPoint(e)
    stroke.current = { x: e.clientX, y: e.clientY, zone: zoneAt(p.x, p.y, spec.anchors.mouth), moved: 0, turns: 0, dir: 0, lastX: e.clientX, lastY: e.clientY, patted: 0 }
    longPressed.current = false
    window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      if ((stroke.current?.moved ?? 0) > 12) return
      longPressed.current = true
      navigator.vibrate?.(20)
      touchReact('hug', 'love')
    }, LONG_PRESS_MS)
  }
  function onPointerMove(e: PointerEvent) {
    const st = stroke.current
    if (!st) return
    const dx = e.clientX - st.lastX
    const d = Math.hypot(dx, e.clientY - st.lastY)
    if (d < 3) return
    st.moved += d
    st.lastX = e.clientX
    st.lastY = e.clientY
    if (st.moved > 12) window.clearTimeout(pressTimer.current)
    // Back-and-forth on the belly = tickling; stroking the head = patting (a fresh reaction every ~140 px).
    const dir = Math.sign(dx)
    if (Math.abs(dx) > 4 && dir !== 0 && dir !== st.dir) {
      if (st.dir !== 0) st.turns++
      st.dir = dir
    }
    if (busy.current && Date.now() < reactingUntil.current) return
    if ((st.zone === 'belly' || st.zone === 'body') && st.turns >= 3) {
      st.turns = 0
      touchReact('tickle', 'tickle')
    } else if (st.zone === 'head' && st.moved - st.patted > 140) {
      st.patted = st.moved
      touchReact('pat', 'pat')
    }
  }
  function onPointerUp() {
    window.clearTimeout(pressTimer.current)
    const st = stroke.current
    stroke.current = null
    if (!st || longPressed.current || st.moved > 12) return
    touched()
    // A tap: on the nose = poke, on the head = pat, anywhere else = a happy little reaction.
    if (st.zone === 'face') return touchReact('poke', 'poke')
    if (st.zone === 'head') return touchReact('pat', 'pat')
    tapReaction()
  }
  const cancelPress = () => {
    window.clearTimeout(pressTimer.current)
    stroke.current = null
  }
  function tapReaction() {
    onTapProp?.()
    onTouch?.('tap')
    if (nightRef.current) return busy.current ? undefined : react('yawn')
    // A playing reaction is never cut off; a burst of taps makes the pet cross for a moment (#104).
    const r = tap(taps.current, Date.now(), Date.now() < reactingUntil.current)
    taps.current = r.state
    if (r.outcome === 'annoyed') return react('grumpy')
    if (r.outcome === 'ignore') return
    const next = pickOther(TAP_ACTIONS, lastTap.current as (typeof TAP_ACTIONS)[number] | null, rnd)
    lastTap.current = next
    react(next)
  }
  /** Keyboard (Enter / Space): a click with no pointer. */
  function onClick(e: MouseEvent) {
    if (e.detail !== 0) return
    touched()
    tapReaction()
  }

  const [mx, my] = spec.anchors.mouthIn?.[pose] ?? spec.anchors.mouth
  const [hx, hy] = spec.anchors.head
  const at = (x: number, y: number): CSSProperties => ({ left: `${x * 100}%`, top: `${y * 100}%` })
  const airborne = spec.alive === 'float' && !asleep

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={t('pet.tapLabel', { name: t(`pet.species.${species}`) })}
      className={cn('pet relative block touch-manipulation select-none', paused && 'pet-paused', className)}
      style={{ width: size, aspectRatio: `${spec.aspect * (1 + 2 * ROOM.side)} / ${1 + ROOM.top + ROOM.bottom}`, fontSize: size / 12 }}
    >
      {/* The art box: room for every move is around it, inside the footprint. */}
      <span
        ref={box}
        className="absolute"
        style={{
          left: `${(ROOM.side / (1 + 2 * ROOM.side)) * 100}%`,
          width: `${(1 / (1 + 2 * ROOM.side)) * 100}%`,
          top: `${(ROOM.top / (1 + ROOM.top + ROOM.bottom)) * 100}%`,
          height: `${(1 / (1 + ROOM.top + ROOM.bottom)) * 100}%`,
          transform: stageScale !== 1 ? `scale(${stageScale})` : undefined,
          transformOrigin: '50% 100%',
          transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <span aria-hidden="true" className={cn('pet-shadow-wrap absolute bottom-[-3%] left-[16%] h-[9%] w-[68%]', airborne && 'pet-shadow-float')}>
          <span ref={shadow} className="pet-shadow block size-full rounded-[50%] bg-black/10 dark:bg-black/40" />
        </span>
        <span aria-hidden="true" className={cn('pet-alive absolute inset-0', asleep ? 'pet-sleeping' : spec.alive === 'float' ? 'pet-float' : 'pet-breathe')}>
          <span ref={move} className={cn('pet-move absolute inset-0', walking && 'is-walking', walking === 'left' && 'is-left', walking && !hasOwnArt(poses, 'walkA') && 'is-hopping')}>
            {POSES.filter((p) => p !== 'blink' && p !== 'walkA' && p !== 'walkB').map((p) => (
              <img
                key={p}
                src={poses[p]}
                alt=""
                draggable={false}
                decoding="async"
                className="pet-layer absolute inset-0 size-full"
                style={{ opacity: p === pose && eatFrame === null && !walking ? 1 : 0, zIndex: p === pose ? 2 : 0 }}
              />
            ))}
            {walking && (
              <>
                <img src={poses.walkA} alt="" draggable={false} className="pet-layer pet-walk-a absolute inset-0 size-full" style={{ zIndex: 2 }} />
                <img src={poses.walkB} alt="" draggable={false} className="pet-layer pet-walk-b absolute inset-0 size-full" style={{ zIndex: 2 }} />
              </>
            )}
            {spec.eatFrames?.map((src, i) => (
              <img
                key={src}
                src={src}
                alt=""
                draggable={false}
                decoding="async"
                className="pet-layer absolute inset-0 size-full"
                style={{ opacity: eatFrame === i ? 1 : 0, zIndex: eatFrame === i ? 3 : 0 }}
              />
            ))}
            <img
              src={poses.blink}
              alt=""
              draggable={false}
              decoding="async"
              className="pet-layer absolute inset-0 size-full"
              style={{ opacity: blink && pose === 'main' ? 1 : 0, zIndex: 3, transition: 'opacity 45ms linear' }}
            />
            {held && <img key={held.key} src={held.src} alt="" draggable={false} className="pet-held absolute" style={{ ...at(mx, my), width: '24%' }} />}
            {/* Inside the move layer, so puffs, bubbles and hearts start from the mouth / head wherever the body goes. */}
            <PetOverlay key={overlay.key} name={asleep ? 'z' : overlay.name} mouth={at(mx, my)} head={at(hx, hy)} />
          </span>
        </span>
      </span>
      <span ref={clockEl} aria-hidden="true" className="pointer-events-none absolute size-px opacity-0" />
    </button>
  )
}

/** Little drawings around the pet. Sized in em (1em = footprint / 12) so they scale with the pet. */
/** Earth's effect stickers (image/09-effects.png, cut by piece) + the Zzz from the race props. */
const FX = { heart, heartRed, spark, sparkSmall, cloud, cloudSmall, bubble, bubbleBig, crumbs: [crumb1, crumb2, crumb3], anger, zzz }

function PetOverlay({ name, mouth, head }: { name: Overlay; mouth: CSSProperties; head: CSSProperties }) {
  if (name === 'none') return null
  const img = (src: string, cls: string, style: CSSProperties, key?: number) => <img key={key} src={src} alt="" draggable={false} className={`pet-fx absolute ${cls}`} style={style} />
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[4]">
      {name === 'sparks' &&
        [-1.6, 0.2, 1.8].map((dx, i) =>
          img(i === 1 ? FX.spark : FX.sparkSmall, 'pet-spark w-[1em]', { ...head, marginLeft: `${dx}em`, marginTop: `${-0.4 - (i % 2) * 0.5}em`, animationDelay: `${i * 0.1}s` }, i),
        )}
      {name === 'hearts' &&
        [-1, 0.3, 1.4].map((dx, i) => img(i === 1 ? FX.heartRed : FX.heart, 'pet-heart w-[0.95em]', { ...head, marginLeft: `${dx}em`, animationDelay: `${i * 0.22}s` }, i))}
      {name === 'puff' &&
        [0, 1, 2].map((i) => img(i === 0 ? FX.cloud : FX.cloudSmall, 'pet-puff', { ...mouth, width: `${1.6 - i * 0.35}em`, animationDelay: `${0.12 + i * 0.1}s` }, i))}
      {name === 'bubbles' &&
        [0, 1, 2].map((i) => img(i === 0 ? FX.bubbleBig : FX.bubble, 'pet-bubble', { ...mouth, width: `${0.8 - i * 0.18}em`, animationDelay: `${i * 0.25}s` }, i))}
      {name === 'crumbs' &&
        [0, 1, 2, 3].map((i) => img(FX.crumbs[i % 3], 'pet-crumb w-[0.3em]', { ...mouth, marginLeft: `${(i - 1.5) * 0.35}em`, animationDelay: `${0.2 + i * 0.35}s` }, i))}
      {name === 'confetti' &&
        ['#F6C445', '#FF7A9A', '#7CC6F2', '#8FD694', '#B89CF0', '#F6C445', '#FF7A9A', '#7CC6F2'].map((c, i) => (
          <span
            key={i}
            className="pet-fx pet-confetti absolute block h-[0.35em] w-[0.18em] rounded-[0.05em]"
            style={{ ...head, background: c, ['--dx' as string]: `${(i - 3.5) * 0.9}em`, ['--rot' as string]: `${(i % 2 ? 1 : -1) * (120 + i * 30)}deg`, animationDelay: `${(i % 4) * 0.08}s` }}
          />
        ))}
      {name === 'anger' && img(FX.anger, 'pet-anger w-[1.1em]', { ...head, marginLeft: '1.3em', marginTop: '-0.5em' })}
      {name === 'z' && img(FX.zzz, 'pet-z w-[1.6em]', { ...head, marginLeft: '1.9em' })}
    </span>
  )
}
