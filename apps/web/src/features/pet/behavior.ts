// What the pet does and when (DECISIONS #80). Pure: no timers, no DOM. Tested in behavior.test.ts.
// The <Pet> component runs these plans with timers and CSS; this file decides.

export const POSES = ['main', 'blink', 'happy', 'wave', 'shy', 'play1', 'play2', 'play3', 'sleep', 'eat', 'celebrate', 'yawn', 'sad', 'bath', 'refuse', 'bliss', 'laugh', 'surprised', 'walkA', 'walkB', 'beg', 'sitPretty', 'highFive', 'playDead', 'eatOpen', 'eatChew', 'eatDone'] as const
export type PoseId = (typeof POSES)[number]

/** One-shot body motion (CSS keyframes in pet.css, transform only). */
export type Motion = 'none' | 'squish' | 'hop' | 'wave' | 'shy' | 'fly' | 'dash' | 'turn' | 'sneeze' | 'jump' | 'chomp' | 'dance' | 'stretch' | 'look' | 'wiggle' | 'bounce' | 'spin' | 'jolt' | 'flop'
/** Little drawings around the pet. */
export type Overlay = 'none' | 'sparks' | 'hearts' | 'puff' | 'bubbles' | 'z' | 'crumbs' | 'confetti' | 'anger'

export type PetAction = 'happy' | 'wave' | 'shy' | 'love' | 'play1' | 'play2' | 'play3' | 'eat' | 'celebrate' | 'yawn' | 'sleep' | 'fidget' | 'grumpy' | 'refuse' | 'pat' | 'tickle' | 'poke' | 'beg' | TrickId
/** Tricks you can teach (#121). */
export const TRICKS = ['trickSit', 'trickFive', 'trickSpin', 'trickJump', 'trickDead'] as const
export type TrickId = (typeof TRICKS)[number]

export type Plan = { pose: PoseId; motion: Motion; overlay: Overlay; /** How long before going back to the main pose. 0 = stays (sleep). */ ms: number }

/** Per-species play moves: the same pose slots, different motion. */
export type SpeciesMoves = Record<'play1' | 'play2' | 'play3', { motion: Motion; overlay: Overlay; ms: number }>

export const TAP_ACTIONS = ['happy', 'wave', 'shy'] as const satisfies readonly PetAction[]
export const PLAY_ACTIONS = ['play1', 'play2', 'play3'] as const satisfies readonly PetAction[]

export function planFor(action: PetAction, moves: SpeciesMoves): Plan {
  switch (action) {
    case 'happy':
      return { pose: 'happy', motion: 'hop', overlay: 'sparks', ms: 1300 }
    case 'wave':
      return { pose: 'wave', motion: 'wave', overlay: 'none', ms: 1500 }
    case 'shy':
      return { pose: 'shy', motion: 'shy', overlay: 'hearts', ms: 1600 }
    case 'love':
      return { pose: 'happy', motion: 'squish', overlay: 'hearts', ms: 1800 }
    case 'play1':
    case 'play2':
    case 'play3':
      return { pose: action, ...moves[action] }
    case 'eat':
      return { pose: 'eat', motion: 'chomp', overlay: 'crumbs', ms: 2000 }
    case 'celebrate':
      return { pose: 'celebrate', motion: 'dance', overlay: 'confetti', ms: 2400 }
    case 'yawn':
      return { pose: 'yawn', motion: 'stretch', overlay: 'none', ms: 1900 }
    case 'sleep':
      return { pose: 'sleep', motion: 'none', overlay: 'z', ms: 0 }
    case 'fidget':
      return { pose: 'main', ...FIDGETS[0] }
    // Touch (#121): pat on the head, tickle the belly, poke the nose. Begging = it wants something.
    case 'pat':
      return { pose: 'bliss', motion: 'squish', overlay: 'hearts', ms: 1500 }
    case 'tickle':
      return { pose: 'laugh', motion: 'wiggle', overlay: 'sparks', ms: 1500 }
    case 'poke':
      return { pose: 'surprised', motion: 'jolt', overlay: 'none', ms: 1000 }
    case 'beg':
      return { pose: 'beg', motion: 'bounce', overlay: 'none', ms: 1600 }
    // Tricks (#121).
    case 'trickSit':
      return { pose: 'sitPretty', motion: 'squish', overlay: 'sparks', ms: 1700 }
    case 'trickFive':
      return { pose: 'highFive', motion: 'wave', overlay: 'sparks', ms: 1500 }
    case 'trickSpin':
      return { pose: 'happy', motion: 'spin', overlay: 'sparks', ms: 1300 }
    case 'trickJump':
      return { pose: 'happy', motion: 'jump', overlay: 'sparks', ms: 1600 }
    case 'trickDead':
      return { pose: 'playDead', motion: 'flop', overlay: 'none', ms: 2400 }
    case 'refuse':
      // Full (#119): turns its head away, pushing the food off (image/36, 37).
      return { pose: 'refuse', motion: 'wiggle', overlay: 'none', ms: 1300 }
    case 'grumpy':
      // Poked too fast (#115): a cross-popping anger mark and a cross little shake, no pose change.
      return { pose: 'main', motion: 'wiggle', overlay: 'anger', ms: 1300 }
  }
}

/**
 * Small "alive" moves between the big ones (#113): no pose change, just the body. Looking around, a wiggle,
 * two little bounces, turning round. The Pet picks one (never the same twice) for each 'fidget'.
 */
export const FIDGETS = [
  { motion: 'look', overlay: 'none', ms: 1700 },
  { motion: 'wiggle', overlay: 'none', ms: 900 },
  { motion: 'bounce', overlay: 'none', ms: 1000 },
  { motion: 'turn', overlay: 'none', ms: 1500 },
] as const satisfies readonly { motion: Motion; overlay: Overlay; ms: number }[]

/** Pick from a list, never the same as last time (when there is a choice). `random(n)` → 0…n-1. */
export function pickOther<T>(list: readonly T[], last: T | null, random: (n: number) => number): T {
  const pool = list.length > 1 ? list.filter((x) => x !== last) : list
  return pool[random(pool.length)]
}

/** 22:00–05:59 local time. */
export const isNight = (hour: number) => hour >= 22 || hour < 6

/**
 * Next idle move: at night mostly yawns. By day about half are small fidgets, the rest play moves
 * (not the last one) and the odd yawn (#113: it used to sit still 9–20 s, Earth found it too quiet).
 */
export function pickIdle(last: PetAction | null, hour: number, random: (n: number) => number): PetAction {
  if (isNight(hour) && random(10) < 6) return 'yawn'
  const r = random(20)
  if (r < 11) return 'fidget'
  if (r === 11) return 'yawn'
  return pickOther(PLAY_ACTIONS, last as (typeof PLAY_ACTIONS)[number] | null, random)
}

/** Wait before the next idle move: 3.5–7 s, never the same rhythm. */
export const idleDelayMs = (random: (n: number) => number) => 3500 + random(3501)

/** Fall asleep after this long without being touched: sooner at night. */
export const sleepAfterMs = (hour: number) => (isNight(hour) ? 40_000 : 75_000)

/** Hold this long for "love" (hearts) instead of a tap. */
export const LONG_PRESS_MS = 480
/** Blink every 2.5–6 s, eyes shut ~130 ms. */
export const blinkDelayMs = (random: (n: number) => number) => 2500 + random(3501)
export const BLINK_MS = 130

/** Eating as a flipbook (#108): Earth's 4 frames (open → bite → chew → smile), chewing twice. ms from the start. */
export const EAT_FLIP: { frame: 0 | 1 | 2 | 3; at: number }[] = [
  { frame: 0, at: 0 },
  { frame: 1, at: 380 },
  { frame: 2, at: 700 },
  { frame: 1, at: 960 },
  { frame: 2, at: 1220 },
  { frame: 3, at: 1500 },
]
