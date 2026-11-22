import { useEffect, useRef, useState } from 'react'
import { PET_FOODS } from '@/config/petFoods'

/** A snack falling in the catch game; x and y in % of the room. */
type Drop = { id: number; x: number; y: number; art: string; speed: number }
export const CATCH_SECONDS = 25

type CatchGameProps = {
  /** Where the pet is (% of the room width); the page moves it. */
  petX: number
  running: boolean
  onCatch: () => void
  onEnd: (score: number) => void
}

// รับขนม (#121): snacks fall, drag the pet under them. Short (25 s), a coin per catch, capped per day by the page.
export function CatchGame({ petX, running, onCatch, onEnd }: CatchGameProps) {
  const [drops, setDrops] = useState<Drop[]>([])
  const [left, setLeft] = useState(CATCH_SECONDS)
  const petRef = useRef(petX)
  const score = useRef(0)
  useEffect(() => {
    petRef.current = petX
  })
  useEffect(() => {
    if (!running) return
    score.current = 0
    let id = 0
    let last = performance.now()
    let spawnIn = 0
    let elapsed = 0
    let frame = 0
    let list: Drop[] = []
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      elapsed += dt
      spawnIn -= dt
      if (spawnIn <= 0 && elapsed < CATCH_SECONDS - 1) {
        spawnIn = Math.max(0.45, 0.9 - elapsed * 0.02)
        list.push({ id: id++, x: 12 + Math.random() * 76, y: -8, art: PET_FOODS[Math.floor(Math.random() * PET_FOODS.length)].art, speed: 30 + Math.random() * 14 + elapsed })
      }
      const kept: Drop[] = []
      for (const d of list) {
        d.y += d.speed * dt
        // Caught when it reaches the pet's mouth height near its x.
        if (d.y > 66 && d.y < 80 && Math.abs(d.x - petRef.current) < 13) {
          score.current++
          onCatch()
          continue
        }
        if (d.y < 105) kept.push(d)
      }
      list = kept
      setDrops([...list])
      setLeft(Math.max(0, Math.ceil(CATCH_SECONDS - elapsed)))
      if (elapsed >= CATCH_SECONDS) return onEnd(score.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // onCatch / onEnd are read when they fire; restarting the game on every render would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  return (
    <>
      {drops.map((d) => (
        <img key={d.id} src={d.art} alt="" draggable={false} className="pointer-events-none absolute z-[4] w-[13%] -translate-x-1/2" style={{ left: `${d.x}%`, top: `${d.y}%` }} />
      ))}
      {running && <span className="absolute top-3 right-3 z-[5] rounded-full bg-ink px-3 py-1 font-heading text-sm font-bold text-ink-foreground tabular-nums">{left}</span>}
    </>
  )
}
