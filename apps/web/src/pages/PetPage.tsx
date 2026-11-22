import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Bath, BookHeart, ChevronRight, Coins, GraduationCap, Heart, Home, Search, Sparkles, Utensils, Volleyball } from 'lucide-react'
import bubbleArt from '@/assets/effects/bubble.webp'
import bubbleBigArt from '@/assets/effects/bubbleBig.webp'
import { PageHeader } from '@/components/layout/PageHeader'
import { CatchGame } from '@/components/pet/CatchGame'
import { Egg } from '@/components/pet/Egg'
import { FoodSheet } from '@/components/pet/FoodSheet'
import { NeedsBars } from '@/components/pet/NeedsBars'
import { Pet, type PetHandle, type TouchKind } from '@/components/pet/Pet'
import { PetBondSheet } from '@/components/pet/PetBondSheet'
import { PetRoom, type RoomScene } from '@/components/pet/PetRoom'
import { PetTestPanel } from '@/components/pet/PetTestPanel'
import { SouvenirIcon } from '@/components/pet/SouvenirIcon'
import { GestureLayer, TrickPicker } from '@/components/pet/TrickTrainer'
import { Button, buttonVariants } from '@/components/ui/button'
import { PET_FOODS, type PetFood } from '@/config/petFoods'
import { bangkokDayKey } from '@/features/fortune/logic'
import { getMyPet } from '@/features/onboarding/storage'
import { SOUVENIRS, loadAway, takeAwayEvent } from '@/features/pet/away'
import type { TrickId } from '@/features/pet/behavior'
import { BOND_UP_EVENT, bondStore, gainBond, levelOf } from '@/features/pet/bond'
import { bathed, feed, playOnce } from '@/features/pet/care'
import { useCoins } from '@/features/pet/coins'
import { useGrowth } from '@/features/pet/growth'
import { did, payGameCoins, touchedPet, WISH_EVENT, wishesToday } from '@/features/pet/life'
import { applyCare, getNeedsState, isNightAt, moodOf, needsAt, setNeedsState, useNeedsState, wantOf } from '@/features/pet/needs'
import { careLogStore, settleTrait, traitOf } from '@/features/pet/personality'
import { isLearned, practise, trickStore, TRICK_DEFS, type Gesture } from '@/features/pet/tricks'
import { activeWish, wishStore, WISH_MINUTES } from '@/features/pet/wishes'
import { SHOW_BACK } from '@/lib/nav'
import { secureRandomInt } from '@/lib/random'
import { toastManager } from '@/lib/toast'
import { cn } from '@/lib/utils'

type Mode = 'home' | 'play' | 'bath' | 'train' | 'catch' | 'hide'
const SCENE: Record<Mode, RoomScene> = { home: 'living', play: 'garden', bath: 'bath', train: 'garden', catch: 'garden', hide: 'living' }
/** Finger travel (px) for a full bath. */
const SCRUB_PX = 2600
const PLAY_MOVES = ['play1', 'play2', 'play3'] as const
/** Places in the living room the pet walks to (% of the room width). The bed is where it sleeps. */
const SPOTS = { bed: 19, rug: 50, lamp: 74 } as const
/** Hide-and-seek hiding places: x / y in % of the room. */
const HIDES = [
  { id: 'bed', x: 20, y: 80 },
  { id: 'curtain', x: 42, y: 30 },
  { id: 'shelf', x: 9, y: 52 },
  { id: 'lamp', x: 86, y: 55 },
] as const
const MAIN_ACTIONS = [
  { id: 'feed', icon: Utensils, cls: 'bg-tangerine' },
  { id: 'play', icon: Volleyball, cls: 'bg-yolk' },
  { id: 'bath', icon: Bath, cls: 'bg-sky' },
] as const
const MORE_ACTIONS = [
  { id: 'train', icon: GraduationCap },
  { id: 'catch', icon: Sparkles },
  { id: 'hide', icon: Search },
] as const

/** Re-read the clock every 20 s so the bars and wishes move while the page is open. */
function useNow(ms = 20_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

// Tab "สัตว์เลี้ยง" (#119, #121): the pet's room. It wanders, asks for things, loves pats and tickles, learns
// tricks, plays catch and hide-and-seek, and has needs that drop with real time. Gentle: it never dies.
export function PetPage() {
  const { t } = useTranslation()
  const pet = useRef<PetHandle>(null)
  const [myPet] = useState(getMyPet)
  const [away] = useState(() => (myPet ? takeAwayEvent(new Date(), bangkokDayKey(new Date())) : null))
  const [foundCount] = useState(() => loadAway().found.length)
  const showTest = import.meta.env.DEV || import.meta.env.VITE_DEPLOY_MOCKS === 'true'

  const now = useNow()
  const needs = needsAt(useNeedsState(), now)
  const coins = useCoins()
  const bond = bondStore.use()
  const careLog = careLogStore.use()
  const growth = useGrowth()
  wishStore.use()
  const [nightTest, setNightTest] = useState<boolean | null>(null)
  const night = nightTest ?? isNightAt(now)
  const [mode, setMode] = useState<Mode>('home')
  const [sheet, setSheet] = useState<'food' | 'bond' | null>(null)
  // Where the pet is and whether it is walking.
  const [x, setX] = useState<number>(SPOTS.rug)
  const [walking, setWalking] = useState<false | 'left' | 'right'>(false)
  const [walkMs, setWalkMs] = useState(0)
  // Play / bath / train / games.
  const [throwKey, setThrowKey] = useState(0)
  const throwing = useRef(false)
  const [scrub, setScrub] = useState(0)
  const [bubbles, setBubbles] = useState<{ id: number; x: number; y: number; big: boolean }[]>([])
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const bathDone = useRef(false)
  const [trick, setTrick] = useState<TrickId>('trickSit')
  const [catching, setCatching] = useState(false)
  const [catchScore, setCatchScore] = useState<number | null>(null)
  const [hide, setHide] = useState<{ spot: number; tries: number; found: boolean } | null>(null)

  const plan = myPet ? wishesToday(now) : null
  const wish = plan ? activeWish(plan, now) : null
  const trait = traitOf(careLog)

  // An adult that never "grew up" (hatched before growing existed) settles its personality once it shows.
  useEffect(() => {
    if (growth.stage !== 'adult' || careLog.settled || !traitOf(careLog)) return
    const id = window.setTimeout(settleTrait, 0)
    return () => window.clearTimeout(id)
  }, [growth.stage, careLog])

  // Walk somewhere: the page slides the pet, the pet plays its walk cycle. Kept in a ref so timers use the latest.
  const xRef = useRef<number>(SPOTS.rug)
  const walkRef = useRef((to: number) => {
    const from = xRef.current
    if (Math.abs(to - from) < 2) return
    const ms = Math.abs(to - from) * 55
    xRef.current = to
    setWalkMs(ms)
    setWalking(to > from ? 'right' : 'left')
    setX(to)
    window.setTimeout(() => setWalking(false), ms)
  })

  // Wander around the room now and then; at night go to bed.
  useEffect(() => {
    if (mode !== 'home') return
    if (night) {
      const id = window.setTimeout(() => walkRef.current(SPOTS.bed), 0)
      return () => window.clearTimeout(id)
    }
    const id = window.setInterval(() => {
      if (document.hidden) return
      const spots = Object.values(SPOTS)
      walkRef.current(spots[secureRandomInt(spots.length)])
    }, 16_000)
    return () => window.clearInterval(id)
  }, [mode, night])

  // A wish is open: it comes to the middle and begs now and then.
  const wishId = wish?.id
  useEffect(() => {
    if (wishId === undefined || mode !== 'home' || night) return
    const first = window.setTimeout(() => {
      walkRef.current(SPOTS.rug)
      pet.current?.run('beg')
    }, 2200)
    const id = window.setInterval(() => pet.current?.run('beg'), 15_000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(first)
    }
  }, [wishId, mode, night])

  // Wish granted / closer friends: cheer and say so.
  useEffect(() => {
    const onWish = () => {
      pet.current?.run('celebrate')
      toastManager.add({ title: t('pet.wish.granted'), description: t('pet.wish.reward') })
    }
    const onBond = (e: Event) => {
      const lv = (e as CustomEvent<number>).detail
      const unlocked = TRICK_DEFS.find((d) => d.unlock === lv)
      toastManager.add({ title: t('pet.bond.up', { n: lv }), description: unlocked ? t('pet.bond.unlocked', { trick: t(`pet.tricks.names.${unlocked.id}`) }) : undefined })
    }
    window.addEventListener(WISH_EVENT, onWish)
    window.addEventListener(BOND_UP_EVENT, onBond)
    return () => {
      window.removeEventListener(WISH_EVENT, onWish)
      window.removeEventListener(BOND_UP_EVENT, onBond)
    }
  }, [t])

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
  const wishText = wish
    ? t(`pet.wish.${wish.kind}`, {
        food: wish.kind === 'food' ? t(`pet.food.items.${wish.food as PetFood['id']}`) : '',
        trick: wish.kind === 'trick' ? t(`pet.tricks.names.${wish.trick}`) : '',
      }) + ' ' + t('pet.wish.left', { n: Math.max(1, Math.ceil((Date.parse(wish.at) + WISH_MINUTES * 60_000 - now.getTime()) / 60_000)) })
    : null
  const say = night
    ? t('pet.say.sleep', { name })
    : mode === 'bath'
      ? t('pet.say.bath')
      : mode === 'hide'
        ? t('pet.hide.say')
        : mode !== 'home'
          ? null
          : (wishText ?? (want ? t(`pet.say.${want}`) : null))

  function onTouch(kind: TouchKind) {
    if (kind === 'pat' || kind === 'tickle') did({ kind })
    else if (kind === 'hug') did({ kind: 'pat' })
    else touchedPet()
  }

  function onFood(food: PetFood) {
    const r = feed(food)
    setSheet(null)
    if (r === 'fed' || r === 'wish') pet.current?.run('eat', { food: food.art, isCookie: food.id === 'cookie' })
    else if (r === 'full') {
      pet.current?.run('refuse')
      toastManager.add({ title: t('pet.food.full', { name }) })
    } else if (r === 'poor') toastManager.add({ title: t('pet.food.poor'), description: t('pet.food.earnHint') })
    else toastManager.add({ title: t('pet.say.sleep', { name }) })
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

  function enter(next: Mode) {
    setMode(next)
    xRef.current = SPOTS.rug
    setX(SPOTS.rug)
    setWalking(false)
    if (next === 'bath') {
      bathDone.current = false
      setScrub(0)
      setBubbles([])
    }
    if (next === 'catch') {
      setCatchScore(null)
      setCatching(true)
    }
    if (next === 'hide') setHide({ spot: secureRandomInt(HIDES.length), tries: 0, found: false })
  }

  function act(id: (typeof MAIN_ACTIONS)[number]['id'] | (typeof MORE_ACTIONS)[number]['id']) {
    if (id === 'feed') setSheet('food')
    else enter(id)
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

  function onGesture(g: Gesture | null) {
    const def = TRICK_DEFS.find((d) => d.id === trick)!
    if (levelOf(bond.points) < def.unlock) return
    if (g !== def.gesture) return toastManager.add({ title: t('pet.tricks.wrong'), description: t(`pet.tricks.gestures.${def.gesture}`) })
    const progress = trickStore.get()
    if (isLearned(progress, trick)) {
      pet.current?.run(trick)
      did({ kind: 'trick', trick })
      return
    }
    const day = bangkokDayKey(new Date())
    const r = practise(progress, trick, day, secureRandomInt(10_000) / 10_000)
    trickStore.set(r.progress)
    if (r.result === 'tired') return toastManager.add({ title: t('pet.tricks.tired', { name }) })
    if (r.result === 'miss') {
      pet.current?.run('poke')
      return toastManager.add({ title: t('pet.tricks.miss', { name }) })
    }
    pet.current?.run(trick)
    gainBond(r.result === 'learned' ? 'trickLearned' : 'trick', day)
    if (r.result === 'learned') {
      window.setTimeout(() => pet.current?.run('celebrate'), 1800)
      toastManager.add({ title: t('pet.tricks.learnedNow', { name, trick: t(`pet.tricks.names.${trick}`) }) })
    }
  }

  // Catch: the pet follows the finger along the bottom of the garden.
  function onCatchMove(e: PointerEvent<HTMLDivElement>) {
    if (!catching) return
    const r = e.currentTarget.getBoundingClientRect()
    const to = Math.max(10, Math.min(90, ((e.clientX - r.left) / r.width) * 100))
    setWalking(to > x + 1 ? 'right' : to < x - 1 ? 'left' : walking)
    setWalkMs(0)
    xRef.current = to
    setX(to)
  }
  function endCatch(score: number) {
    setCatching(false)
    setWalking(false)
    const paid = payGameCoins(score)
    setNeedsState(applyCare(getNeedsState(), new Date(), { fun: 15 }))
    setCatchScore(score)
    pet.current?.run(score >= 8 ? 'celebrate' : 'happy')
    toastManager.add({ title: t('pet.catch.done', { n: score }), description: paid > 0 ? t('pet.catch.coins', { n: paid }) : t('pet.catch.capped') })
  }

  function seek(i: number) {
    if (!hide || hide.found) return
    if (i === hide.spot) {
      setHide({ ...hide, found: true })
      xRef.current = HIDES[i].x
      setX(HIDES[i].x)
      window.setTimeout(() => pet.current?.run('tickle'), 100)
      const paid = payGameCoins(5)
      setNeedsState(applyCare(getNeedsState(), new Date(), { fun: 15 }))
      toastManager.add({ title: t('pet.hide.found', { name }), description: paid > 0 ? t('pet.catch.coins', { n: paid }) : undefined })
    } else if (hide.tries + 1 >= 3) {
      setHide({ ...hide, tries: 3, found: true })
      xRef.current = HIDES[hide.spot].x
      setX(HIDES[hide.spot].x)
      window.setTimeout(() => pet.current?.run('tickle'), 100)
      toastManager.add({ title: t('pet.hide.gotYou', { name }) })
    } else {
      setHide({ ...hide, tries: hide.tries + 1 })
      toastManager.add({ title: t('pet.hide.notHere') })
    }
  }

  const petHidden = mode === 'hide' && hide && !hide.found
  const lv = levelOf(bond.points)

  return (
    <>
      <PageHeader
        title={t('pages.pet.title')}
        action={
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => setSheet('bond')} className="pressable flex items-center gap-1 rounded-full bg-tangerine px-2.5 py-1 text-sm font-bold text-on-slab" aria-label={t('pet.bond.title', { name })}>
              <Heart className="size-4 fill-current" aria-hidden="true" />
              {lv}
            </button>
            <span className="flex items-center gap-1 rounded-full bg-yolk px-2.5 py-1 text-sm font-bold text-on-slab tabular-nums" aria-label={t('pet.coins', { n: coins })}>
              <Coins className="size-4" aria-hidden="true" />
              {coins}
            </span>
          </span>
        }
      />
      <div className="flex flex-col items-center gap-3 px-4 pt-2 pb-8">
        <PetRoom scene={SCENE[mode]} night={night && mode === 'home'} say={say} className="aspect-[4/5] w-full">
          <div
            className="absolute bottom-[3%] z-[2]"
            style={{ left: `${x}%`, transform: 'translateX(-50%)', transition: walkMs ? `left ${walkMs}ms linear` : undefined, visibility: petHidden ? 'hidden' : undefined }}
          >
            <Pet
              species={myPet.species}
              size={250}
              ref={pet}
              onTouch={onTouch}
              nightMode={night && mode === 'home'}
              mood={moodOf(needs)}
              bathing={mode === 'bath'}
              walking={walking}
            />
          </div>
          {trait && mode === 'home' && !night && <span className="absolute top-3 left-3 z-[4] rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold">{t(`pet.trait.names.${trait}`)}</span>}
          {mode === 'play' && <span key={throwKey} className={cn('pet-ball', throwKey > 0 && 'is-thrown')} aria-hidden="true" />}
          {mode === 'bath' && (
            <div className="absolute inset-0 z-[5] touch-none" onPointerMove={onScrub} onPointerDown={() => (lastPoint.current = null)} aria-label={t('pet.bath.rub')} role="img">
              {bubbles.map((b) => (
                <img key={b.id} src={b.big ? bubbleBigArt : bubbleArt} alt="" className="pet-scrub" style={{ left: b.x, top: b.y }} draggable={false} />
              ))}
            </div>
          )}
          {mode === 'train' && <GestureLayer onGesture={onGesture} />}
          {mode === 'catch' && (
            <div className="absolute inset-0 z-[5] touch-none" onPointerMove={onCatchMove} onPointerDown={onCatchMove}>
              <CatchGame petX={x} running={catching} onCatch={() => navigator.vibrate?.(8)} onEnd={endCatch} />
            </div>
          )}
          {mode === 'hide' &&
            !hide?.found &&
            HIDES.map((h, i) => (
              <button key={h.id} type="button" onClick={() => seek(i)} className="absolute z-[5] size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${h.x}%`, top: `${h.y}%` }} aria-label={t(`pet.hide.spots.${h.id}`)} />
            ))}
        </PetRoom>

        <NeedsBars needs={needs} />

        {mode === 'home' ? (
          <>
            <div className="grid w-full grid-cols-3 gap-2">
              {MAIN_ACTIONS.map((a) => (
                <button key={a.id} type="button" disabled={night} onClick={() => act(a.id)} className={cn('on-slab pressable flex flex-col items-center gap-1 rounded-3xl py-3 font-heading text-base font-bold disabled:opacity-45', a.cls)}>
                  <a.icon className="size-6" aria-hidden="true" />
                  {t(`pet.actions.${a.id}`)}
                </button>
              ))}
            </div>
            <div className="grid w-full grid-cols-3 gap-2">
              {MORE_ACTIONS.map((a) => (
                <button key={a.id} type="button" disabled={night} onClick={() => act(a.id)} className="pressable flex items-center justify-center gap-1.5 rounded-2xl bg-card py-2.5 text-sm font-semibold disabled:opacity-45">
                  <a.icon className="size-4" aria-hidden="true" />
                  {t(`pet.actions.${a.id}`)}
                </button>
              ))}
            </div>
            {night && <p className="text-center text-xs text-muted-foreground">{t('pet.nightHint', { name })}</p>}
            {!night && <p className="text-center text-xs text-muted-foreground">{t('pet.touchHint')}</p>}
          </>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {mode === 'train' && <TrickPicker value={trick} onChange={setTrick} />}
            {mode === 'bath' && (
              <div>
                <p className="mb-1 text-sm font-semibold">{t('pet.bath.rub')}</p>
                <span className="block h-3 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-sky transition-[width]" style={{ width: `${scrub * 100}%` }} />
                </span>
              </div>
            )}
            {mode === 'catch' && <p className="text-center text-sm">{catching ? t('pet.catch.how') : t('pet.catch.done', { n: catchScore ?? 0 })}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" onClick={() => enter('home')} aria-label={t('pet.actions.home')} className={cn(mode === 'bath' || mode === 'train' ? 'flex-1' : '')}>
                <Home />
                {(mode === 'bath' || mode === 'train') && t('pet.actions.home')}
              </Button>
              {mode === 'play' && (
                <Button size="lg" className="flex-1" onClick={throwBall}>
                  <Volleyball data-icon="inline-start" />
                  {t('pet.play.throw')}
                </Button>
              )}
              {mode === 'catch' && !catching && (
                <Button size="lg" className="flex-1" onClick={() => enter('catch')}>
                  {t('pet.catch.again')}
                </Button>
              )}
              {mode === 'hide' && hide?.found && (
                <Button size="lg" className="flex-1" onClick={() => enter('hide')}>
                  {t('pet.hide.again')}
                </Button>
              )}
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

        {showTest && <PetTestPanel onMove={(a) => pet.current?.run(a)} night={nightTest} onNight={setNightTest} foods={PET_FOODS.map((f) => f.id)} />}
      </div>
      <FoodSheet open={sheet === 'food'} onOpenChange={(o) => setSheet(o ? 'food' : null)} coins={coins} onPick={onFood} />
      <PetBondSheet open={sheet === 'bond'} onOpenChange={(o) => setSheet(o ? 'bond' : null)} name={name} />
    </>
  )
}
