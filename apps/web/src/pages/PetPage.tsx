import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Bath, BookHeart, ChevronRight, Coins, Home, Utensils, Volleyball } from 'lucide-react'
import bubbleArt from '@/assets/effects/bubble.webp'
import bubbleBigArt from '@/assets/effects/bubbleBig.webp'
import { PageHeader } from '@/components/layout/PageHeader'
import { Egg } from '@/components/pet/Egg'
import { FoodSheet } from '@/components/pet/FoodSheet'
import { NeedsBars } from '@/components/pet/NeedsBars'
import { Pet, type PetHandle } from '@/components/pet/Pet'
import { PetRoom, type RoomScene } from '@/components/pet/PetRoom'
import { PetTestPanel } from '@/components/pet/PetTestPanel'
import { SouvenirIcon } from '@/components/pet/SouvenirIcon'
import { Button, buttonVariants } from '@/components/ui/button'
import type { PetFood } from '@/config/petFoods'
import { markDone } from '@/features/daily/daily'
import { bangkokDayKey } from '@/features/fortune/logic'
import { getMyPet } from '@/features/onboarding/storage'
import { SOUVENIRS, loadAway, takeAwayEvent } from '@/features/pet/away'
import { bathed, feed, playOnce } from '@/features/pet/care'
import { useCoins } from '@/features/pet/coins'
import { isNightAt, moodOf, needsAt, useNeedsState, wantOf } from '@/features/pet/needs'
import { SHOW_BACK } from '@/lib/nav'
import { toastManager } from '@/lib/toast'
import { cn } from '@/lib/utils'

type Mode = 'home' | 'play' | 'bath'
const SCENE: Record<Mode, RoomScene> = { home: 'living', play: 'garden', bath: 'bath' }
/** Finger travel (px) for a full bath. */
const SCRUB_PX = 2600
const PLAY_MOVES = ['play1', 'play2', 'play3'] as const
const ACTIONS = [
  { id: 'feed', icon: Utensils, cls: 'bg-tangerine' },
  { id: 'play', icon: Volleyball, cls: 'bg-yolk' },
  { id: 'bath', icon: Bath, cls: 'bg-sky' },
] as const

/** Re-read the clock every 30 s so the bars drop while the page is open. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

// Tab "สัตว์เลี้ยง" (#119): the pet's room. Feed it (food costs coins earned in the app), play ball in the garden,
// bath it in the bathroom; three needs drop with real time; it sleeps at night. Gentle: it never dies.
export function PetPage() {
  const { t } = useTranslation()
  const pet = useRef<PetHandle>(null)
  const [myPet] = useState(getMyPet)
  const [away] = useState(() => (myPet ? takeAwayEvent(new Date(), bangkokDayKey(new Date())) : null))
  const [foundCount] = useState(() => loadAway().found.length)
  const showTest = import.meta.env.DEV || import.meta.env.VITE_DEPLOY_MOCKS === 'true'

  const now = useNow()
  const state = useNeedsState()
  const needs = needsAt(state, now)
  const coins = useCoins()
  const [nightTest, setNightTest] = useState<boolean | null>(null)
  const night = nightTest ?? isNightAt(now)
  const [mode, setMode] = useState<Mode>('home')
  const [foodOpen, setFoodOpen] = useState(false)
  const [bite, setBite] = useState<{ art: string; key: number } | null>(null)
  const [throwKey, setThrowKey] = useState(0)
  const throwing = useRef(false)
  const [scrub, setScrub] = useState(0)
  const [bubbles, setBubbles] = useState<{ id: number; x: number; y: number; big: boolean }[]>([])
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const bathDone = useRef(false)

  if (!myPet) {
    return (
      <>
        <PageHeader title={t('pages.pet.title')} />
        <div className="flex flex-col items-center gap-4 px-4 pt-6 text-center">
          <Egg style="mystery" className="h-32" />
          <p className="font-heading text-xl font-bold">{t('pet.noPetTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('pet.noPetText')}</p>
          <Link to="/welcome?step=egg" className={buttonVariants({ size: 'lg' })}>
            {t('pet.hatchNow')}
          </Link>
        </div>
      </>
    )
  }

  const name = t(`pet.species.${myPet.species}`)
  const want = wantOf(needs)
  const say = night
    ? t('pet.say.sleep', { name })
    : mode === 'bath'
      ? t('pet.say.bath')
      : mode === 'play'
        ? null
        : want
          ? t(`pet.say.${want}`)
          : null

  function onFood(food: PetFood) {
    const r = feed(food)
    setFoodOpen(false)
    if (r === 'fed') {
      setBite((b) => ({ art: food.art, key: (b?.key ?? 0) + 1 }))
      pet.current?.run('eat')
    } else if (r === 'full') {
      pet.current?.run('refuse')
      toastManager.add({ title: t('pet.food.full', { name }) })
    } else if (r === 'poor') {
      toastManager.add({ title: t('pet.food.poor'), description: t('pet.food.earnHint') })
    } else toastManager.add({ title: t('pet.say.sleep', { name }) })
  }

  function throwBall() {
    if (throwing.current) return
    throwing.current = true
    setThrowKey((k) => k + 1)
    window.setTimeout(() => {
      pet.current?.run(PLAY_MOVES[Math.floor(Math.random() * PLAY_MOVES.length)])
      playOnce()
    }, 420)
    window.setTimeout(() => (throwing.current = false), 1150)
  }

  function act(id: (typeof ACTIONS)[number]['id']) {
    if (id === 'feed') setFoodOpen(true)
    else if (id === 'play') setMode('play')
    else startBath()
  }

  function startBath() {
    bathDone.current = false
    setScrub(0)
    setBubbles([])
    setMode('bath')
  }
  function onScrub(e: PointerEvent<HTMLDivElement>) {
    if (bathDone.current || (e.pointerType === 'mouse' && e.buttons === 0)) return
    const r = e.currentTarget.getBoundingClientRect()
    const p = { x: e.clientX - r.left, y: e.clientY - r.top }
    const prev = lastPoint.current
    lastPoint.current = p
    if (!prev) return
    const d = Math.hypot(p.x - prev.x, p.y - prev.y)
    if (d < 6) return
    const next = Math.min(1, scrub + d / SCRUB_PX)
    setScrub(next)
    setBubbles((b) => [...b.slice(-13), { id: (b.at(-1)?.id ?? 0) + 1, x: p.x, y: p.y, big: b.length % 3 === 0 }])
    if (next >= 1) {
      bathDone.current = true
      bathed()
      pet.current?.run('happy')
      window.setTimeout(() => setMode('home'), 1400)
    }
  }

  const dirt = mode === 'bath' ? Math.max(0, (50 - needs.clean) / 50) * (1 - scrub) : Math.max(0, (50 - needs.clean) / 50)

  return (
    <>
      <PageHeader
        title={t('pages.pet.title')}
        action={
          <span className="flex items-center gap-1 rounded-full bg-yolk px-3 py-1 text-sm font-bold text-on-slab tabular-nums" aria-label={t('pet.coins', { n: coins })}>
            <Coins className="size-4" aria-hidden="true" />
            {coins}
          </span>
        }
      />
      <div className="flex flex-col items-center gap-3 px-4 pt-2 pb-8">
        <PetRoom scene={SCENE[mode]} night={night} say={say} className="aspect-[4/5] w-full">
          <div className="absolute inset-x-0 bottom-[3%] flex justify-center">
            <div className="relative">
              <Pet species={myPet.species} size={300} ref={pet} onTap={() => markDone('pet')} nightMode={night} mood={moodOf(needs)} />
              {dirt > 0 &&
                [
                  [44, 66, 9],
                  [58, 74, 7],
                  [50, 82, 6],
                ].map(([x, y, w], i) => (
                  <span key={i} className="pet-mud" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${w * 0.8}%`, opacity: dirt * 0.85 }} aria-hidden="true" />
                ))}
            </div>
          </div>
          {mode === 'play' && <span key={throwKey} className={cn('pet-ball', throwKey > 0 && 'is-thrown')} aria-hidden="true" />}
          {mode === 'bath' && (
            <div className="absolute inset-0 z-[5] touch-none" onPointerMove={onScrub} onPointerDown={() => (lastPoint.current = null)} aria-label={t('pet.bath.rub')} role="img">
              {bubbles.map((b) => (
                <img key={b.id} src={b.big ? bubbleBigArt : bubbleArt} alt="" className="pet-scrub" style={{ left: b.x, top: b.y }} draggable={false} />
              ))}
            </div>
          )}
          {bite && <img key={bite.key} src={bite.art} alt="" className="pet-bite" draggable={false} onAnimationEnd={() => setBite(null)} />}
        </PetRoom>

        <NeedsBars needs={needs} />

        {mode === 'home' && (
          <>
            <div className="grid w-full grid-cols-3 gap-2">
              {ACTIONS.map((a) => (
                <button key={a.id} type="button" disabled={night} onClick={() => act(a.id)} className={cn('on-slab pressable flex flex-col items-center gap-1 rounded-3xl py-3 font-heading text-base font-bold disabled:opacity-45', a.cls)}>
                  <a.icon className="size-6" aria-hidden="true" />
                  {t(`pet.actions.${a.id}`)}
                </button>
              ))}
            </div>
            {night && <p className="text-center text-xs text-muted-foreground">{t('pet.nightHint', { name })}</p>}
          </>
        )}
        {mode === 'play' && (
          <div className="flex w-full gap-2">
            <Button variant="secondary" size="lg" onClick={() => setMode('home')} aria-label={t('pet.actions.home')}>
              <Home />
            </Button>
            <Button size="lg" className="flex-1" onClick={throwBall}>
              <Volleyball data-icon="inline-start" />
              {t('pet.play.throw')}
            </Button>
          </div>
        )}
        {mode === 'bath' && (
          <div className="flex w-full items-center gap-3">
            <Button variant="secondary" size="lg" onClick={() => setMode('home')} aria-label={t('pet.actions.home')}>
              <Home />
            </Button>
            <div className="flex-1">
              <p className="mb-1 text-sm font-semibold">{t('pet.bath.rub')}</p>
              <span className="block h-3 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-sky transition-[width]" style={{ width: `${scrub * 100}%` }} />
              </span>
            </div>
          </div>
        )}

        <Link to="/pet/album" state={SHOW_BACK} className="on-slab pressable flex w-full items-center gap-3 rounded-3xl bg-mint p-4">
          {away?.souvenir ? <SouvenirIcon id={away.souvenir} className="size-12" /> : <BookHeart className="size-8 shrink-0" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-lg font-medium">{t('pet.album.open')}</span>
            <span className="block text-[13px] text-pretty text-muted-foreground">
              {away
                ? t(`pet.away.${away.activity}`, { name }) + (away.souvenir ? t('pet.away.found', { item: t(`pet.souvenirs.${away.souvenir}`) }) : '')
                : t('pet.album.count', { n: foundCount, total: SOUVENIRS.length })}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
        </Link>

        {showTest && <PetTestPanel onMove={(act) => pet.current?.run(act)} night={nightTest} onNight={setNightTest} />}
      </div>
      <FoodSheet open={foodOpen} onOpenChange={setFoodOpen} coins={coins} onPick={onFood} />
    </>
  )
}
