import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Crown, Eye, Play, Pointer, RotateCcw, Settings2, Users } from 'lucide-react'
import { NumberStepper } from '@/components/common/NumberStepper'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { BottomAction } from '@/components/games/BottomAction'
import { PackPicker } from '@/components/games/PackPicker'
import { PassPhone } from '@/components/games/PassPhone'
import { RoleCardBack, RoleReveal } from '@/components/games/RoleReveal'
import { TimerBar } from '@/components/games/TimerBar'
import { Button } from '@/components/ui/button'
import { WORD_PACKS } from '@/config/wordPacks'
import { markDone } from '@/features/daily/daily'
import { celebrate } from '@/lib/celebrate'
import { gameDeck } from '@/lib/deck'
import { useGameSettings } from '@/lib/gameSettings'
import { buzz, playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { tintClass } from '@/lib/tones'
import { useCountdown } from '@/lib/useCountdown'
import { cn } from '@/lib/utils'
import { MAX_PLAYERS, MIN_PLAYERS, MINUTES, dealInsider, roleOf, talkSeconds, type InsiderMinutes, type InsiderRound } from './logic'
import { INSIDER_DEFAULTS, fixInsiderSettings, insiderPool, type InsiderSettings } from './settings'
import '@/components/games/games.css'

type Stage =
  | { kind: 'setup' }
  | { kind: 'master' }
  | { kind: 'pass'; player: number }
  | { kind: 'look'; player: number; open: boolean }
  | { kind: 'ask' }
  | { kind: 'talk'; seconds: number }
  | { kind: 'reveal'; guessed: boolean }

const deck = gameDeck('insider')
const fix = fixInsiderSettings

const fmt = (s: number) => `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`

// คนวงใน on one phone: announce the master → deal roles player by player → ask yes/no questions against the clock
// → if guessed, talk as long as the guessing took → point at the insider together → reveal.
export function InsiderGame() {
  const { t } = useTranslation()
  const sound = useGameSound('insider')
  const [settings, setSettings] = useGameSettings<InsiderSettings>('insider', INSIDER_DEFAULTS, fix)
  const [stage, setStage] = useState<Stage>({ kind: 'setup' })
  const [round, setRound] = useState<InsiderRound | null>(null)
  const total = settings.minutes * 60

  const asking = useCountdown(total, stage.kind === 'ask', () => {
    if (sound) playSound('end')
    buzz([80, 60, 80])
    setStage({ kind: 'reveal', guessed: false })
  })
  const talkTotal = stage.kind === 'talk' ? stage.seconds : TALK_FALLBACK
  const talking = useCountdown(talkTotal, stage.kind === 'talk', () => {
    if (sound) playSound('end')
    buzz([80, 60, 80])
  })

  const set = (patch: Partial<InsiderSettings>) => setSettings((s) => fix({ ...s, ...patch }))
  const player = (n: number) => t('games.spy.player', { n: n + 1 })

  function deal() {
    unlockSound()
    const word = deck.order(insiderPool(settings.packs), (w) => w)[0]
    deck.markSeen([word])
    setRound(dealInsider({ players: settings.players, word }))
    asking.reset(total)
    setStage({ kind: 'master' })
    markDone('tool')
  }

  function guessed() {
    const seconds = talkSeconds(total - asking.left)
    talking.reset(seconds)
    setStage({ kind: 'talk', seconds })
    if (sound) playSound('correct')
    buzz(40)
  }

  function reveal() {
    setStage({ kind: 'reveal', guessed: true })
    if (sound) playSound('end')
    celebrate()
  }

  if (stage.kind === 'setup' || !round) {
    return (
      <div className="flex flex-col gap-3 pb-28">
        <ol className="mx-4 grid gap-2 rounded-3xl bg-card p-4 text-sm">
          {(['deal', 'ask', 'vote'] as const).map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{i + 1}</span>
              <span>{t(`games.insider.how.${step}`)}</span>
            </li>
          ))}
        </ol>

        <div className="mx-4 flex items-center justify-between gap-3 rounded-3xl bg-card p-3">
          <span className="text-sm font-medium">{t('games.spy.players')}</span>
          <NumberStepper label={t('games.spy.players')} value={settings.players} min={MIN_PLAYERS} max={MAX_PLAYERS} onChange={(players) => set({ players })} />
        </div>

        <SectionHeader title={t('games.insider.minutesTitle')} />
        <div className="px-4">
          <SegmentedChoice<`${InsiderMinutes}`>
            label={t('games.insider.minutesTitle')}
            value={`${settings.minutes}`}
            onChange={(v) => set({ minutes: Number(v) as InsiderMinutes })}
            options={MINUTES.map((m) => ({ value: `${m}` as `${InsiderMinutes}`, label: t('games.minutes', { count: m }) }))}
          />
        </div>

        <SectionHeader title={t('games.party.packsTitle')} />
        <PackPicker
          multiple
          label={t('games.party.packsTitle')}
          value={settings.packs}
          onChange={(packs) => set({ packs })}
          packs={WORD_PACKS.map((p) => ({ id: p.id, icon: p.icon, tint: p.tint, name: t(`headsUp.packs.${p.id}.name`), meta: t('headsUp.wordsCount', { count: p.words.length }) }))}
        />

        <BottomAction>
          <Button size="lg" className="flex-1" onClick={deal}>
            <Play data-icon="inline-start" />
            {t('games.spy.deal')}
          </Button>
        </BottomAction>
      </div>
    )
  }

  if (stage.kind === 'master') {
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        <div className={cn('game-pop flex flex-col items-center gap-3 rounded-3xl p-6 text-center', tintClass(4))}>
          <Crown className="game-breathe size-16" aria-hidden="true" />
          <span className="text-sm opacity-80">{t('games.insider.masterIs')}</span>
          <span className="text-4xl font-medium">{player(round.master)}</span>
          <span className="max-w-xs text-sm opacity-80">{t('games.insider.masterJob')}</span>
        </div>
        <p className="text-center text-sm text-muted-foreground">{t('games.insider.secretInsider')}</p>
        <Button size="lg" onClick={() => setStage({ kind: 'pass', player: 0 })}>
          {t('games.insider.dealRoles')}
        </Button>
      </div>
    )
  }

  if (stage.kind === 'pass') {
    return (
      <PassPhone
        key={stage.player}
        title={t('games.spy.passTo', { name: player(stage.player) })}
        hint={t('games.spy.passHint', { n: stage.player + 1, total: settings.players })}
        action={t('games.spy.imPlayer', { name: player(stage.player) })}
        onContinue={() => setStage({ kind: 'look', player: stage.player, open: false })}
      />
    )
  }

  if (stage.kind === 'look') {
    const role = roleOf(round, stage.player)
    const last = stage.player + 1 >= settings.players
    return (
      <RoleReveal
        playerLabel={player(stage.player)}
        open={stage.open}
        onOpen={() => {
          setStage({ ...stage, open: true })
          if (sound) playSound('flip')
        }}
        onDone={() => {
          if (!last) setStage({ kind: 'pass', player: stage.player + 1 })
          else {
            setStage({ kind: 'ask' })
            if (sound) playSound('go')
          }
        }}
        doneLabel={last ? t('games.insider.startAsking') : t('games.spy.hideAndPass')}
        icon={Eye}
        tint={7}
        back={
          role === 'master' ? (
            <RoleCardBack icon={Crown} className={tintClass(4)} label={t('games.insider.roles.master')} text={round.word} note={t('games.insider.notes.master')} />
          ) : role === 'insider' ? (
            <RoleCardBack icon={Eye} className="bg-foreground text-background" label={t('games.insider.roles.insider')} text={round.word} note={t('games.insider.notes.insider')} />
          ) : (
            <RoleCardBack icon={Users} className={tintClass(5)} label={t('games.insider.roles.common')} text="???" note={t('games.insider.notes.common')} />
          )
        }
      />
    )
  }

  if (stage.kind === 'ask') {
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        <div className={cn('flex flex-col items-center gap-2 rounded-3xl p-6 text-center', tintClass(7))}>
          <span className="text-sm opacity-80">{t('games.insider.askThe', { name: player(round.master) })}</span>
          <span className="text-6xl font-medium tabular-nums">{fmt(asking.left)}</span>
        </div>
        <TimerBar left={asking.left} total={total} />
        <ul className="grid gap-1.5 rounded-3xl bg-card p-4 text-sm">
          {(['q1', 'q2', 'q3'] as const).map((k) => (
            <li key={k}>• {t(`games.insider.tips.${k}`)}</li>
          ))}
        </ul>
        <Button size="lg" onClick={guessed}>
          <Check data-icon="inline-start" />
          {t('games.insider.gotIt')}
        </Button>
      </div>
    )
  }

  if (stage.kind === 'talk') {
    const over = talking.left === 0
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        <div className={cn('game-pop flex flex-col items-center gap-2 rounded-3xl p-6 text-center', tintClass(5))}>
          <span className="text-sm opacity-80">{t('games.insider.wordWas')}</span>
          <span className="text-4xl font-medium">{round.word}</span>
        </div>
        <div className={cn('flex flex-col items-center gap-2 rounded-3xl p-6 text-center', over ? 'game-shake ' + tintClass(1) : tintClass(7))}>
          <span className="text-sm opacity-80">{over ? t('games.spy.timeUp') : t('games.insider.whoIsInsider')}</span>
          <span className="text-6xl font-medium tabular-nums">{fmt(talking.left)}</span>
          <span className="max-w-xs text-sm opacity-80">{t('games.insider.talkHint')}</span>
        </div>
        <TimerBar left={talking.left} total={stage.seconds} />
        <Button size="lg" onClick={reveal}>
          <Pointer data-icon="inline-start" />
          {t('games.insider.pointAndReveal')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      {!stage.guessed && (
        <div className={cn('game-shake flex flex-col items-center gap-1 rounded-3xl p-5 text-center', tintClass(1))} role="status">
          <span className="text-2xl font-medium">{t('games.insider.timeUpTitle')}</span>
          <span className="text-sm opacity-80">{t('games.insider.timeUpText')}</span>
        </div>
      )}
      <div className="game-pop flex flex-col items-center gap-3 rounded-3xl bg-foreground p-6 text-center text-background">
        <Eye className="size-14" aria-hidden="true" />
        <span className="text-sm opacity-80">{t('games.insider.insiderWas')}</span>
        <span className="text-4xl font-medium" role={stage.guessed ? 'status' : undefined}>
          {player(round.insider)}
        </span>
      </div>
      <div className={cn('grid gap-1 rounded-3xl p-5 text-center', tintClass(5))}>
        <span className="text-sm opacity-80">{t('games.insider.wordWas')}</span>
        <span className="text-3xl font-medium">{round.word}</span>
      </div>
      {stage.guessed && <p className="text-center text-sm text-muted-foreground">{t('games.insider.scoreHint')}</p>}
      <Button size="lg" onClick={deal}>
        <RotateCcw data-icon="inline-start" />
        {t('games.playAgain')}
      </Button>
      <Button variant="outline" onClick={() => setStage({ kind: 'setup' })}>
        <Settings2 data-icon="inline-start" />
        {t('games.changeSettings')}
      </Button>
    </div>
  )
}

/** Placeholder length for the talk timer before a round reaches it (it is reset to the real length on a guess). */
const TALK_FALLBACK = 60
