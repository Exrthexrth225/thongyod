import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Cat, Check, ChevronRight, Crown, Gamepad2, Pencil, Play, Plus, Ribbon, RotateCcw, Shuffle, Trophy, X, type LucideIcon } from 'lucide-react'
import { SectionHeader } from '@/components/common/SectionHeader'
import { BottomAction } from '@/components/games/BottomAction'
import { CircleEditor } from '@/components/games/CircleEditor'
import { PlayingCard } from '@/components/games/PlayingCard'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MINI_GAMES, STANDARD_SET, type Rule, type RuleSet } from '@/config/games/fatCat'
import { markDone } from '@/features/daily/daily'
import { circleStore } from '@/features/games/circle'
import { celebrate } from '@/lib/celebrate'
import { useGameSettings } from '@/lib/gameSettings'
import { SHOW_BACK } from '@/lib/nav'
import { secureRandomInt } from '@/lib/random'
import { playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { tintClass, tintOfName } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { cardsLeft, copySet, deckDone, drawer, flip, openCard, reshuffle, resolve, standings, startHand, targetsFor, withBuddies, type Hand } from './logic'
import { allSets, handStore, setById, setsStore } from './store'
import '@/components/games/games.css'

const TINT = 3

// แมวอ้วง (#123): the phone sits in the middle of the circle; whoever's turn it is taps to open a card, the app says
// what it means and who it hits, and remembers the queen, the scarf buddies, the king rule and who got hit most.
export function FatCatGame() {
  const hand = handStore.use()
  return hand ? <Table hand={hand} /> : <Setup />
}

function Setup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const custom = setsStore.use()
  const [{ setId }, setSettings] = useGameSettings<{ setId: string }>('fatCat', { setId: STANDARD_SET.id })
  const chosen = setById(custom, setId)

  function newSet() {
    const id = `g${secureRandomInt(1_000_000_000)}`
    setsStore.set([...custom, copySet(chosen, id, t('games.fatCat.sets.newName', { n: custom.length + 1 }))])
    setSettings({ setId: id })
    void navigate(`/games/fat-cat/rules/${id}`, { state: SHOW_BACK })
  }

  function start() {
    unlockSound()
    const players = circleStore.get()
    const hand = startHand(chosen.id, players)
    handStore.set({ ...hand, turn: players.length ? secureRandomInt(players.length) : 0 })
    markDone('tool')
  }

  return (
    <div className="flex flex-col gap-3 pb-28">
      <ol className="mx-4 grid gap-2 rounded-3xl bg-card p-4 text-sm">
        {(['middle', 'open', 'paws'] as const).map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{i + 1}</span>
            <span>{t(`games.fatCat.how.${step}`)}</span>
          </li>
        ))}
      </ol>

      <SectionHeader title={t('games.circle.section')} />
      <CircleEditor />

      <SectionHeader title={t('games.fatCat.sets.title')} />
      <div className="mx-4 flex flex-col gap-1.5" role="radiogroup" aria-label={t('games.fatCat.sets.title')}>
        {allSets(custom).map((s) => (
          <div key={s.id} className={cn('flex items-center gap-1 rounded-2xl border-2 bg-card pr-1', s.id === chosen.id ? 'border-primary' : 'border-transparent')}>
            <button type="button" role="radio" aria-checked={s.id === chosen.id} onClick={() => setSettings({ setId: s.id })} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', s.id === chosen.id ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                {s.id === chosen.id && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.id === STANDARD_SET.id ? t('games.fatCat.sets.standard') : s.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{t('games.fatCat.sets.penalty', { penalty: s.penalty })}</span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(s.id === STANDARD_SET.id ? 'games.fatCat.sets.view' : 'games.fatCat.sets.edit', { name: s.name })}
              onClick={() => void navigate(`/games/fat-cat/rules/${s.id}`, { state: SHOW_BACK })}
            >
              {s.id === STANDARD_SET.id ? <ChevronRight /> : <Pencil />}
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={newSet}>
          <Plus data-icon="inline-start" />
          {t('games.fatCat.sets.new', { name: chosen.id === STANDARD_SET.id ? t('games.fatCat.sets.standard') : chosen.name })}
        </Button>
      </div>

      <BottomAction>
        <Button size="lg" className="flex-1" onClick={start}>
          <Play data-icon="inline-start" />
          {t('games.fatCat.start')}
        </Button>
      </BottomAction>
    </div>
  )
}

function Table({ hand }: { hand: Hand }) {
  const { t } = useTranslation()
  const sound = useGameSound('fatCat')
  const custom = setsStore.use()
  const set = setById(custom, hand.setId)
  const [tallyOpen, setTallyOpen] = useState(false)
  const card = openCard(hand)
  const rule = card ? set.rules[card.rank] : null
  const me = drawer(hand)
  const named = hand.players.length > 0

  function open() {
    unlockSound()
    if (sound) playSound('flip')
    navigator.vibrate?.(10)
    handStore.set(flip(hand))
  }
  function done(out: Parameters<typeof resolve>[2]) {
    const next = resolve(hand, rule!, out)
    handStore.set(next)
    if (deckDone(next)) {
      if (sound) playSound('end')
      celebrate()
    }
  }

  if (deckDone(hand)) {
    return (
      <div className="flex flex-col gap-3 px-4 pb-28">
        <div className={cn('flex flex-col items-center gap-2 rounded-3xl p-6 text-center', tintClass(TINT))}>
          <Trophy className="size-12" aria-hidden="true" />
          <p className="font-heading text-2xl font-bold">{t('games.fatCat.deckDone')}</p>
          <p className="text-sm opacity-85">{t('games.fatCat.deckDoneHint')}</p>
        </div>
        {named && <Standings hand={hand} penalty={set.penalty} />}
        <BottomAction>
          <Button variant="outline" size="lg" onClick={() => handStore.set(null)}>
            <X data-icon="inline-start" />
            {t('games.fatCat.end')}
          </Button>
          <Button size="lg" className="flex-1" onClick={() => handStore.set(reshuffle(hand))}>
            <Shuffle data-icon="inline-start" />
            {t('games.fatCat.reshuffle')}
          </Button>
        </BottomAction>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-8">
      <div className="flex flex-wrap gap-1.5">
        <StatusChip icon={Cat} text={set.always} className="bg-ink text-ink-foreground" />
        {hand.queen && <StatusChip icon={Crown} text={t('games.fatCat.status.queen', { name: hand.queen })} className={tintClass(6)} />}
        {hand.scarves.length > 0 && <StatusChip icon={Ribbon} text={t('games.fatCat.status.scarves', { names: hand.scarves.join(' + ') })} className={tintClass(1)} />}
        {hand.kRule && <StatusChip icon={Crown} text={t('games.fatCat.status.king', { rule: hand.kRule })} className={tintClass(4)} />}
      </div>

      <div className="flex items-end justify-between gap-2">
        <p className="min-w-0 truncate font-heading text-2xl font-bold">{me ? t('games.fatCat.turn', { name: me }) : t('games.fatCat.turnAnyone')}</p>
        <p className="shrink-0 text-sm text-muted-foreground tabular-nums">{t('games.fatCat.left', { n: cardsLeft(hand) })}</p>
      </div>

      {!card || !rule ? (
        <button type="button" onClick={open} className={cn('pressable flex h-[min(52dvh,30rem)] min-h-72 flex-col items-center justify-center gap-3 rounded-3xl text-center', tintClass(TINT))}>
          <Cat className="game-breathe size-24" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-heading text-3xl font-bold">{t('games.fatCat.tapToOpen')}</span>
          <span className="text-sm opacity-85">{me ? t('games.fatCat.tapWho', { name: me }) : t('games.fatCat.tapHint')}</span>
        </button>
      ) : (
        <>
          <div className="flex items-start gap-4">
            <PlayingCard key={hand.drawn} rank={card.rank} suit={card.suit} label={t('games.fatCat.cardLabel', { rank: card.rank, suit: t(`games.fatCat.suits.${card.suit}`) })} className="w-[34%] shrink-0" />
            <div key={`r${hand.drawn}`} className="game-card-in min-w-0 flex-1 pt-1">
              <p className="font-heading text-[28px] leading-tight font-extrabold text-balance">{rule.title}</p>
              <p className="mt-1.5 text-base leading-relaxed text-pretty">{rule.text}</p>
            </div>
          </div>
          <Resolver key={hand.drawn} hand={hand} rule={rule} set={set} onDone={done} />
        </>
      )}

      <div className="flex gap-2 pt-2">
        {named && (
          <Button variant="outline" className="flex-1" onClick={() => setTallyOpen(true)}>
            <Trophy data-icon="inline-start" />
            {t('games.fatCat.tally')}
          </Button>
        )}
        <Button variant="ghost" className={named ? '' : 'flex-1'} onClick={() => handStore.set(null)}>
          <RotateCcw data-icon="inline-start" />
          {t('games.fatCat.end')}
        </Button>
      </div>

      <BottomSheet open={tallyOpen} onOpenChange={setTallyOpen} title={t('games.fatCat.tally')}>
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <Standings hand={hand} penalty={set.penalty} />
        </div>
      </BottomSheet>
    </div>
  )
}

function StatusChip({ icon: Icon, text, className }: { icon: LucideIcon; text: string; className: string }) {
  return (
    <span className={cn('flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold', className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{text}</span>
    </span>
  )
}

/** Under the open card: who it hits (named straight away or picked), then on to the next player. */
function Resolver({ hand, rule, set, onDone }: { hand: Hand; rule: Rule; set: RuleSet; onDone: (out: Parameters<typeof resolve>[2]) => void }) {
  const { t } = useTranslation()
  const { names, choose } = targetsFor(rule, hand)
  const [picked, setPicked] = useState<string[]>(names)
  const [kRule, setKRule] = useState(hand.kRule ?? '')
  const me = drawer(hand)
  const named = hand.players.length > 0

  if (!named) {
    return (
      <Button size="lg" onClick={() => onDone({ kRule: rule.who === 'king' ? kRule : undefined })}>
        {t('games.fatCat.next')}
        <ChevronRight data-icon="inline-end" />
      </Button>
    )
  }

  const single = choose === 1
  const toggle = (name: string) =>
    setPicked((p) => {
      if (p.includes(name)) return p.filter((x) => x !== name)
      if (single) return [name]
      if (choose > 1 && p.length >= choose) return [...p.slice(1), name]
      return [...p, name]
    })
  const showChips = rule.who !== 'none' && rule.who !== 'queen'
  const hitNow = rule.who === 'duel' ? [] : withBuddies(picked, hand.scarves)
  const buddies = hitNow.filter((x) => !picked.includes(x))
  const ready = rule.who === 'duel' ? picked.length === 1 : rule.who === 'pick' ? picked.length > 0 : true

  const prompt =
    rule.who === 'pick'
      ? t('games.fatCat.pick', { n: choose })
      : rule.who === 'duel'
        ? t('games.fatCat.duelLoser')
        : rule.who === 'game'
          ? t('games.fatCat.gameLoser')
          : rule.who === 'king'
            ? t('games.fatCat.kingWho')
            : t('games.fatCat.hit')

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-4">
      {rule.who === 'queen' && me && <p className="text-base font-medium">{t('games.fatCat.queenNow', { name: me })}</p>}
      {rule.who === 'king' && (
        <>
          <p className="rounded-2xl bg-muted p-3 text-sm">{hand.kRule ? t('games.fatCat.kingNow', { rule: hand.kRule }) : t('games.fatCat.kingNone')}</p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('games.fatCat.kingNew', { name: me })}
            <Input value={kRule} onChange={(e) => setKRule(e.target.value)} maxLength={80} placeholder={t('games.fatCat.kingPlaceholder')} />
          </label>
        </>
      )}
      {rule.who === 'game' && (
        <div className="grid grid-cols-2 gap-2">
          {MINI_GAMES.map((g) => (
            <Link key={g.id} to={g.to} state={SHOW_BACK} className="pressable flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-sm font-semibold">
              <Gamepad2 className="size-4 shrink-0" aria-hidden="true" />
              {t(`games.list.${g.id}.title`)}
            </Link>
          ))}
        </div>
      )}
      {showChips && (
        <>
          <p className="text-sm font-semibold">{prompt}</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={prompt}>
            {hand.players.map((name) => {
              const on = picked.includes(name)
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(name)}
                  className={cn('pressable h-10 rounded-full px-4 text-sm font-semibold', on ? 'bg-ink text-ink-foreground' : cn('opacity-90', tintClass(tintOfName(name))))}
                >
                  {name}
                </button>
              )
            })}
          </div>
          {buddies.length > 0 && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Ribbon className="size-4" aria-hidden="true" />{t('games.fatCat.buddiesToo', { names: buddies.join(', ') })}</p>}
        </>
      )}
      <Button
        size="lg"
        disabled={!ready}
        onClick={() =>
          onDone({
            hit: rule.who === 'duel' ? [] : picked,
            loser: rule.who === 'duel' ? picked[0] : undefined,
            kRule: rule.who === 'king' ? kRule : undefined,
          })
        }
      >
        {rule.who === 'duel'
          ? t('games.fatCat.scarfOn')
          : hitNow.length
            ? t('games.fatCat.hitGo', { n: hitNow.length, penalty: set.penalty })
            : t('games.fatCat.next')}
        <ChevronRight data-icon="inline-end" />
      </Button>
    </div>
  )
}

function Standings({ hand, penalty }: { hand: Hand; penalty: string }) {
  const { t } = useTranslation()
  const rows = standings(hand)
  const top = rows[0]?.hits ?? 0
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">{t('games.fatCat.tallyHint', { penalty })}</p>
      <ol className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.name} className={cn('flex items-center gap-3 rounded-2xl px-3 py-2.5', r.hits > 0 && r.hits === top ? tintClass(TINT) : 'bg-card')}>
            <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
            {r.hits > 0 && r.hits === top && <Crown className="size-4" aria-label={t('games.fatCat.most')} />}
            <span className="font-heading text-xl font-bold tabular-nums">{r.hits}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
