// Small confetti burst (motion plan #3, DECISIONS #98). DOM squares moved by the Web Animations API, no library,
// no canvas. Colours are the brand slabs, read from CSS so they follow light/dark mode. Off with Reduce Motion.

export type Particle = { dx: number; dy: number; rot: number; size: number; delay: number; color: number; ms: number }

const SLABS = ['--yolk', '--tangerine', '--mint', '--sky', '--lilac']

/** Pure part (tested): where each piece flies. Upward fan, then gravity pulls it down past the start. */
export function confettiParticles(count: number, rnd: () => number = Math.random): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 0.9
    const power = 90 + rnd() * 140
    return {
      dx: Math.cos(angle) * power,
      dy: Math.sin(angle) * power,
      rot: (rnd() - 0.5) * 900,
      size: 6 + Math.round(rnd() * 5),
      delay: Math.round(rnd() * 80),
      color: i % SLABS.length,
      ms: 900 + Math.round(rnd() * 500),
    }
  })
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Burst from a point on screen (client coordinates). */
export function confettiBurst(x: number, y: number, count = 28): void {
  if (typeof document === 'undefined' || reducedMotion() || !document.body.animate) return
  const style = getComputedStyle(document.documentElement)
  const colors = SLABS.map((v) => style.getPropertyValue(v).trim() || '#ffc21a')
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden'
  document.body.appendChild(layer)
  const done = confettiParticles(count).map((p) => {
    const piece = document.createElement('span')
    piece.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${p.size}px;height:${Math.round(p.size * 0.6)}px;border-radius:2px;background:${colors[p.color]}`
    layer.appendChild(piece)
    return piece.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${p.dx}px), calc(-50% + ${p.dy}px)) rotate(${p.rot / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${p.dx * 1.3}px), calc(-50% + ${p.dy + 260}px)) rotate(${p.rot}deg)`, opacity: 0 },
      ],
      { duration: p.ms, delay: p.delay, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'forwards' },
    ).finished
  })
  void Promise.allSettled(done).then(() => layer.remove())
}

/** Burst from the middle of an element. */
export function confettiFrom(el: Element | null, count?: number): void {
  if (!el) return
  const r = el.getBoundingClientRect()
  confettiBurst(r.left + r.width / 2, r.top + r.height / 2, count)
}
