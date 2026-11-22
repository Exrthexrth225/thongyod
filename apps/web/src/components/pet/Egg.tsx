import './pet.css'
import { cn } from '@/lib/utils'
import fire from '@/assets/eggs/fire.webp'
import fireCrack from '@/assets/eggs/fireCrack.webp'
import fireTop from '@/assets/eggs/fireTop.webp'
import fireBottom from '@/assets/eggs/fireBottom.webp'
import sleepy from '@/assets/eggs/sleepy.webp'
import sleepyCrack from '@/assets/eggs/sleepyCrack.webp'
import sleepyTop from '@/assets/eggs/sleepyTop.webp'
import sleepyBottom from '@/assets/eggs/sleepyBottom.webp'
import mystery from '@/assets/eggs/mystery.webp'
import mysteryCrack from '@/assets/eggs/mysteryCrack.webp'
import mysteryTop from '@/assets/eggs/mysteryTop.webp'
import mysteryBottom from '@/assets/eggs/mysteryBottom.webp'

export type EggStyle = 'fire' | 'sleepy' | 'mystery'

/** Earth's egg art (image/10-eggs.png, 11-egg-shells.png). */
const EGGS: Record<EggStyle, { whole: string; crack: string; top: string; bottom: string }> = {
  fire: { whole: fire, crack: fireCrack, top: fireTop, bottom: fireBottom },
  sleepy: { whole: sleepy, crack: sleepyCrack, top: sleepyTop, bottom: sleepyBottom },
  mystery: { whole: mystery, crack: mysteryCrack, top: mysteryTop, bottom: mysteryBottom },
}

/** idle → wobble → cracked (cracks show, wobbles harder) → split (the top flies off, the bottom stays a moment). */
export type EggState = 'idle' | 'wobble' | 'cracked' | 'split'

type EggProps = { style: EggStyle; state?: EggState; className?: string }

// A pet egg for the first hatch (choose 1 of 3, DECISIONS #47). Size it with a height class; width follows the art.
export function Egg({ style, state = 'idle', className }: EggProps) {
  const art = EGGS[style]
  return (
    <span aria-hidden="true" className={cn('egg relative inline-block aspect-[262/300]', state === 'wobble' && 'egg-wobble', state === 'cracked' && 'egg-cracked', className)}>
      {state === 'split' ? (
        <>
          <img src={art.bottom} alt="" draggable={false} className="egg-bottom absolute inset-x-0 bottom-0 mx-auto w-full" />
          <img src={art.top} alt="" draggable={false} className="egg-top absolute inset-x-0 top-0 mx-auto w-full" />
        </>
      ) : (
        <img src={state === 'cracked' ? art.crack : art.whole} alt="" draggable={false} className="size-full object-contain" />
      )}
    </span>
  )
}
