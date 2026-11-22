import { useRef, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import type { TrickId } from '@/features/pet/behavior'
import { bondStore, levelOf } from '@/features/pet/bond'
import { isLearned, LEARN_AFTER, readGesture, trickStore, TRICK_DEFS, type Gesture } from '@/features/pet/tricks'
import { cn } from '@/lib/utils'

/** The layer over the room that reads the teaching gesture (swipe, circle, double tap). */
export function GestureLayer({ onGesture }: { onGesture: (g: Gesture | null) => void }) {
  const path = useRef<{ x: number; y: number }[]>([])
  const lastTap = useRef(0)
  function down(e: PointerEvent) {
    path.current = [{ x: e.clientX, y: e.clientY }]
  }
  function move(e: PointerEvent) {
    if (path.current.length) path.current.push({ x: e.clientX, y: e.clientY })
  }
  function up() {
    const pts = path.current
    path.current = []
    const travel = pts.length > 1 ? Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) : 0
    if (pts.length <= 3 || travel < 12) {
      const now = Date.now()
      if (now - lastTap.current < 380) {
        lastTap.current = 0
        return onGesture('doubleTap')
      }
      lastTap.current = now
      return
    }
    onGesture(readGesture(pts))
  }
  return <div className="absolute inset-0 z-[5] touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => (path.current = [])} aria-hidden="true" />
}

// Pick a trick to teach (#121). Locked ones show the ความสนิท level they need; learned ones can be asked for.
export function TrickPicker({ value, onChange }: { value: TrickId; onChange: (id: TrickId) => void }) {
  const { t } = useTranslation()
  const lv = levelOf(bondStore.use().points)
  const progress = trickStore.use()
  const def = TRICK_DEFS.find((d) => d.id === value)!
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TRICK_DEFS.map((d) => {
          const locked = lv < d.unlock
          return (
            <button
              key={d.id}
              type="button"
              disabled={locked}
              onClick={() => onChange(d.id)}
              className={cn('pressable flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold', d.id === value ? 'bg-ink text-ink-foreground' : 'bg-card', locked && 'opacity-50')}
            >
              {locked && <Lock className="size-3.5" aria-hidden="true" />}
              {t(`pet.tricks.names.${d.id}`)}
            </button>
          )
        })}
      </div>
      <p className="rounded-2xl bg-card px-3 py-2 text-sm">
        <span className="font-semibold">{t(`pet.tricks.gestures.${def.gesture}`)}</span>{' '}
        <span className="text-muted-foreground">
          {isLearned(progress, value) ? t('pet.tricks.askHint') : t('pet.tricks.progress', { n: progress.good[value] ?? 0, total: LEARN_AFTER })}
        </span>
      </p>
    </div>
  )
}
