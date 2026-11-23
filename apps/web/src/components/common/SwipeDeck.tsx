import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { confettiFrom } from '@/lib/confetti'
import { cn } from '@/lib/utils'

export type SwipeDir = 'right' | 'left' | 'up'

export type SwipeAction = {
  dir: SwipeDir
  /** Stamp text on the card while dragging, and the button label. */
  label: string
  icon: LucideIcon
  /** Tailwind classes for the stamp and button color. */
  tone: string
}

type SwipeDeckProps<T> = {
  items: T[]
  getKey: (item: T) => string
  renderCard: (item: T) => ReactNode
  /** 2 or 3 actions (left / up / right). Buttons always do the same as swiping (WCAG 2.5.7). "up" is a button (and the
   * ↑ key) only: dragging up would fight scrolling the page (#128). */
  actions: SwipeAction[]
  onSwipe: (item: T, dir: SwipeDir) => void
  /** Tap (not drag) on the top card, or Enter: open its full details (Tinder-style). */
  onOpen?: (item: T) => void
  /** Accessible name of the deck, e.g. "คำชวนที่รอคุณตอบ". */
  label: string
  /** Full-page deck: taller cards. */
  tall?: boolean
  /** renderCard draws its own card surface (e.g. a 3D flip card); the deck adds no border/background. */
  bare?: boolean
  /** Card surface classes. Default a soft `bg-card` block; e.g. `bg-tangerine on-slab` for invites (#97). */
  surface?: string
  /** Confetti from the card when it leaves this way (invite: right = ไป). */
  celebrate?: SwipeDir
  /** Small extra line under the answer buttons, inside the card (e.g. "ซ่อนนัดนี้"). */
  renderFooter?: (item: T) => ReactNode
}

/** Commit when dragged past this share of the card, or flung faster than this (px/ms). */
const COMMIT_SHARE = 0.32
const COMMIT_VELOCITY = 0.6
/** Past this share the card gets "heavy" (rubber band) so it never runs off by accident. */
const FREE_SHARE = 0.45
const RUBBER = 0.25
const MAX_ROTATE = 12
const FLY_MS = 280
/** Letting go short of a swipe: the card springs back with a small overshoot. */
const SPRING_MS = 420
/** Movement before deciding between "drag the card" (sideways) and "scroll the page" (up/down). */
const LOCK_PX = 8
/** A press shorter/smaller than this is a tap, not a drag. */
const TAP_MS = 300
const TAP_PX = 6
/** How many cards show behind the top one. */
const BEHIND = 2

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Free movement up to `limit`, then resistance. */
function rubber(d: number, limit: number): number {
  const abs = Math.abs(d)
  return abs <= limit ? d : Math.sign(d) * (limit + (abs - limit) * RUBBER)
}

// A stack of cards answered by swiping or with the buttons below (UX_GUIDELINES §3, DECISIONS #57).
// No library: pointer events + CSS transforms (transform/opacity only).
export function SwipeDeck<T>({ items, getKey, renderCard, actions, onSwipe, onOpen, label, tall, bare, surface = 'bg-card', celebrate, renderFooter }: SwipeDeckProps<T>) {
  const topCard = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false, w: 300, h: 300 })
  const [flying, setFlying] = useState<SwipeDir | null>(null)
  const start = useRef({ x: 0, y: 0, t: 0, moved: 0 })
  const top = items[0]
  const allowed = new Set(actions.map((a) => a.dir))
  const lock = useRef<'x' | 'y' | null>(null)

  function commit(dir: SwipeDir) {
    if (!top || flying) return
    navigator.vibrate?.(15)
    if (dir === celebrate) confettiFrom(topCard.current)
    if (reducedMotion()) {
      onSwipe(top, dir)
      setDrag((d) => ({ ...d, x: 0, y: 0, active: false }))
      return
    }
    setFlying(dir)
    window.setTimeout(() => {
      onSwipe(top, dir)
      setFlying(null)
      setDrag((d) => ({ ...d, x: 0, y: 0, active: false }))
    }, FLY_MS)
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (flying || (e.target as HTMLElement).closest('a,button')) return
    lock.current = null
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0 }
    const box = e.currentTarget.getBoundingClientRect()
    setDrag({ x: 0, y: 0, active: true, w: box.width, h: box.height })
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.active) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    start.current.moved = Math.max(start.current.moved, Math.hypot(dx, dy))
    // Which way did the finger start? Mostly up/down = the person is scrolling the page (#128, Earth): the card stays
    // put and the browser scrolls (touch-action: pan-y). Only a sideways start drags the card.
    if (!lock.current) {
      if (Math.hypot(dx, dy) < LOCK_PX) return
      lock.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
    }
    if (lock.current === 'y') {
      if (drag.x !== 0) setDrag((d) => ({ ...d, x: 0, y: 0 }))
      return
    }
    setDrag((d) => ({ ...d, x: rubber(dx, d.w * FREE_SHARE), y: Math.max(-12, Math.min(dy * 0.08, 12)) }))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!drag.active) return
    const ms = Math.max(1, e.timeStamp - start.current.t)
    if (lock.current === 'y') return cancelDrag()
    if (onOpen && top && ms < TAP_MS && start.current.moved < TAP_PX) {
      setDrag((d) => ({ ...d, x: 0, y: 0, active: false }))
      onOpen(top)
      return
    }
    const vx = drag.x / ms
    if (drag.x > drag.w * COMMIT_SHARE || vx > COMMIT_VELOCITY) return commit('right')
    if (-drag.x > drag.w * COMMIT_SHARE || vx < -COMMIT_VELOCITY) return commit('left')
    setDrag((d) => ({ ...d, x: 0, y: 0, active: false })) // spring back
  }

  function cancelDrag() {
    if (!flying) setDrag((d) => ({ ...d, x: 0, y: 0, active: false }))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && onOpen && top) {
      e.preventDefault()
      onOpen(top)
      return
    }
    const dir = ({ ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up' } as const)[e.key as 'ArrowRight']
    if (dir && allowed.has(dir)) {
      e.preventDefault()
      commit(dir)
    }
  }

  if (!top) return null

  // Answer buttons (#97): labelled pills, the "yes" one dark and widest. Inside the card when the deck draws the
  // surface, so it is clear they answer this card and they fly away with it (Earth, 2026-11-22); under it for bare decks.
  const buttons = (
    <div className={cn('grid gap-2', bare && 'mx-4')} style={{ gridTemplateColumns: actions.length === 2 ? '1fr 1.35fr' : '1fr 1fr 1.35fr' }}>
      {actions
        .slice()
        .sort((a, b) => ({ left: 0, up: 1, right: 2 })[a.dir] - ({ left: 0, up: 1, right: 2 })[b.dir])
        .map(({ dir, label: text, icon: Icon }) => (
          <button
            key={dir}
            type="button"
            onClick={() => commit(dir)}
            className={cn(
              'pressable flex h-13 items-center justify-center gap-1.5 rounded-2xl text-[15px] font-semibold',
              dir === 'right' ? 'bg-ink text-ink-foreground' : 'bg-card text-foreground',
            )}
          >
            <Icon className="size-5" strokeWidth={2.4} aria-hidden="true" />
            {text}
          </button>
        ))}
    </div>
  )

  // Which stamp shows while dragging, and how strongly (0..1).
  const upward = -drag.y > Math.abs(drag.x)
  const hint: SwipeDir | null = flying ?? (upward && drag.y < -20 ? 'up' : drag.x > 20 ? 'right' : drag.x < -20 ? 'left' : null)
  const strength = flying ? 1 : Math.min(1, Math.max(Math.abs(drag.x), Math.abs(drag.y)) / (drag.w * COMMIT_SHARE))

  // ไป flies off to the right, ไม่ไป drops away, อาจจะ floats up with a little tilt (motion plan #3).
  const fly = { right: 'translate(130%, -8%) rotate(18deg)', left: 'translate(-45%, 115%) rotate(-24deg)', up: 'translate(0, -130%) rotate(-6deg)' }
  const transform = flying
    ? fly[flying]
    : `translate(${drag.x}px, ${drag.y}px) rotate(${Math.max(-MAX_ROTATE, Math.min(MAX_ROTATE, drag.x / 18))}deg)`
  const animate = !drag.active || flying

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative mx-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        style={{ paddingBottom: BEHIND * 10 }}
      >
        {/* Cards waiting behind, like a real stack. The next one grows into place while you drag. */}
        {items
          .slice(1, 1 + BEHIND)
          .map((item, i) => {
            const depth = i + 1 - (i === 0 ? strength : 0)
            return (
              <div
                key={getKey(item)}
                aria-hidden="true"
                inert
                className={cn('absolute inset-x-0 flex flex-col overflow-hidden rounded-3xl', !bare && surface)}
                style={{
                  top: 0,
                  bottom: BEHIND * 10,
                  transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.05})`,
                  transformOrigin: '50% 100%',
                  opacity: 1 - depth * 0.25,
                  zIndex: BEHIND - i,
                  transition: animate ? `transform ${FLY_MS}ms ease-out, opacity ${FLY_MS}ms ease-out` : 'none',
                }}
              >
                {/* Only the surface shows behind: their text would peek out under the top card. */}
                <div className="invisible flex flex-1 flex-col">{renderCard(item)}</div>
              </div>
            )
          })
          .reverse()}
        <div
          key={getKey(top)}
          ref={topCard}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          className={cn('relative z-10 flex touch-pan-y flex-col rounded-3xl select-none', !bare && surface, onOpen && 'cursor-pointer', tall && 'min-h-[58dvh]')}
          style={{
            transform,
            opacity: flying ? 0 : 1,
            transition: animate ? `transform ${flying ? FLY_MS : SPRING_MS}ms ${flying ? 'cubic-bezier(0.4, 0, 0.9, 0.6)' : 'cubic-bezier(0.34, 1.56, 0.64, 1)'}, opacity ${FLY_MS}ms ease-in` : 'none',
          }}
        >
          {renderCard(top)}
          {!bare && (
            <div className="flex flex-col items-center gap-1 px-5 pb-4 [&>*:first-child]:w-full">
              {buttons}
              {renderFooter?.(top)}
            </div>
          )}
          {actions.map((a) => (
            <span
              key={a.dir}
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-5 z-10 rounded-lg border-4 bg-card/70 px-3 py-0.5 text-lg font-bold tracking-wide',
                a.dir === 'right' && 'left-5 -rotate-12',
                a.dir === 'left' && 'right-5 rotate-12',
                a.dir === 'up' && 'left-1/2 -translate-x-1/2',
                a.tone,
              )}
              style={{ opacity: hint === a.dir ? strength : 0 }}
            >
              {a.label}
            </span>
          ))}
        </div>
      </div>
      {bare && buttons}
    </div>
  )
}
