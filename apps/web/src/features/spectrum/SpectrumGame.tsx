import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Lock, Play, RotateCcw, Settings2, Trophy } from 'lucide-react'
import { NumberStepper } from '@/components/common/NumberStepper'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { BottomAction } from '@/components/games/BottomAction'
import { PassPhone } from '@/components/games/PassPhone'
import { SpectrumDial } from '@/components/games/SpectrumDial'
import { Button } from '@/components/ui/button'
import { SPECTRUM_CARDS } from '@/config/games/spectrum'
import { markDone } from '@/features/daily/daily'
import { celebrate } from '@/lib/celebrate'
import { gameDeck } from '@/lib/deck'
import { useGameSettings } from '@/lib/gameSettings'
import { buzz, playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { MAX_POINTS, ROUNDS, clueGiver, pickTarget, rating, scoreGuess, type SpectrumRounds } from './logic'
import '@/components/games/games.css'

type Settings = { players: number; rounds: SpectrumRounds }
const DEFAULTS: Settings = { players: 4, rounds: 7 }
const fix = (raw: Partial<Settings>): Settings => ({
  players: Math.max(2, Math.min(12, Math.round(raw.players ?? DEFAULTS.players) || DEFAULTS.players)),
  rounds: ROUNDS.includes(raw.rounds as SpectrumRounds) ? (raw.rounds as SpectrumRounds) : DEFAULTS.rounds,
})

type Card = readonly [string, string]
type Turn = { card: Card; target: number; guess: number; points: number | null }
type Stage = { kind: 'setup' } | { kind: 'pass' } | { kind: 'secret'; shown: boolean } | { kind: 'guess' } | { kind: 'result' } | { kind: 'end' }

const deck = gameDeck('spectrum')

// คลื่นความคิด, everyone on one team: the clue giver sees the target and says one clue, the team turns the needle,
// points by how close. Clue giver rotates; a fixed number of rounds; the total gets a rating.
export function SpectrumGame() {
  const { t } = useTranslation()
  const sound = useGameSound('spectrum')
  const [settings, setSettings] = useGameSettings<Settings>('spectrum', DEFAULTS, fix)
  const [stage, setStage] = useState<Stage>({ kind: 'setup' })
  const [cards, setCards] = useState<Card[]>([])
  const [round, setRound] = useState(0)
  const [turn, setTurn] = useState<Turn | null>(null)
  const [total, setTotal] = useState(0)

  const set = (patch: Partial<Settings>) => setSettings((s) => fix({ ...s, ...patch }))
  const giver = t('games.spy.player', { n: clueGiver(round, settings.players) + 1 })

  function newTurn(index: number, list: Card[]) {
    setTurn({ card: list[index], target: pickTarget(), guess: 50, points: null })
    setRound(index)
    setStage({ kind: 'pass' })
  }

  function start() {
    unlockSound()
    const list = deck.order(SPECTRUM_CARDS, (c) => c.join('|')).slice(0, settings.rounds)
    deck.markSeen(list.map((c) => c.join('|')))
    setCards(list)
    setTotal(0)
    newTurn(0, list)
    markDone('tool')
  }

  function lockIn() {
    if (!turn) return
    const points = scoreGuess(turn.target, turn.guess)
    setTurn({ ...turn, points })
    setTotal((x) => x + points)
    setStage({ kind: 'result' })
    if (sound) playSound(points >= 3 ? 'correct' : points > 0 ? 'pop' : 'wrong')
    buzz(points >= 3 ? [40, 40, 40] : 40)
    if (points === MAX_POINTS) celebrate()
  }

  function next() {
    if (round + 1 < cards.length) newTurn(round + 1, cards)
    else {
      setStage({ kind: 'end' })
      if (sound) playSound('end')
      celebrate()
    }
  }

  if (stage.kind === 'setup' || !turn) {
    return (
      <div className="flex flex-col gap-3 pb-28">
        <ol className="mx-4 grid gap-2 rounded-3xl bg-card p-4 text-sm">
          {(['peek', 'clue', 'turn'] as const).map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{i + 1}</span>
              <span>{t(`games.spectrum.how.${step}`)}</span>
            </li>
          ))}
        </ol>
        <div className="mx-4 flex items-center justify-between gap-3 rounded-3xl bg-card p-3">
          <span className="text-sm font-medium">{t('games.spy.players')}</span>
          <NumberStepper label={t('games.spy.players')} value={settings.players} min={2} max={12} onChange={(players) => set({ players })} />
        </div>
        <SectionHeader title={t('games.spectrum.roundsTitle')} />
        <div className="px-4">
          <SegmentedChoice<`${SpectrumRounds}`>
            label={t('games.spectrum.roundsTitle')}
            value={`${settings.rounds}`}
            onChange={(v) => set({ rounds: Number(v) as SpectrumRounds })}
            options={ROUNDS.map((n) => ({ value: `${n}` as `${SpectrumRounds}`, label: t('games.spectrum.rounds', { count: n }) }))}
          />
        </div>
        <BottomAction>
          <Button size="lg" className="flex-1" onClick={start}>
            <Play data-icon="inline-start" />
            {t('games.start')}
          </Button>
        </BottomAction>
      </div>
    )
  }

  const progress = t('games.spectrum.roundOf', { n: round + 1, total: cards.length })
  const [left, right] = turn.card

  if (stage.kind === 'pass') {
    return (
      <PassPhone
        key={round}
        title={t('games.spy.passTo', { name: giver })}
        hint={t('games.spectrum.passHint', { round: progress })}
        action={t('games.spy.imPlayer', { name: giver })}
        onContinue={() => setStage({ kind: 'secret', shown: false })}
      />
    )
  }

  if (stage.kind === 'secret') {
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        <p className="text-center text-sm text-muted-foreground">
          {progress} · {t('games.spectrum.youGiveClue', { name: giver })}
        </p>
        <SpectrumDial left={left} right={right} value={null} target={stage.shown ? turn.target : null} label={t('games.spectrum.dialLabel', { left, right })} />
        <p className={cn('rounded-2xl p-4 text-center text-sm', tintClass(8))}>{stage.shown ? t('games.spectrum.thinkClue') : t('games.spectrum.onlyYou')}</p>
        {stage.shown ? (
          <Button
            size="lg"
            onClick={() => {
              setStage({ kind: 'guess' })
              if (sound) playSound('go')
            }}
          >
            <EyeOff data-icon="inline-start" />
            {t('games.spectrum.hideTarget')}
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setStage({ kind: 'secret', shown: true })
              if (sound) playSound('flip')
            }}
          >
            <Eye data-icon="inline-start" />
            {t('games.spectrum.showTarget')}
          </Button>
        )}
      </div>
    )
  }

  if (stage.kind === 'guess') {
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        <p className="text-center text-sm text-muted-foreground">{progress}</p>
        <p className={cn('rounded-2xl p-4 text-center text-sm', tintClass(8))}>{t('games.spectrum.teamTurn', { name: giver })}</p>
        <SpectrumDial left={left} right={right} value={turn.guess} target={null} onChange={(guess) => setTurn({ ...turn, guess })} label={t('games.spectrum.dialLabel', { left, right })} />
        <Button size="lg" onClick={lockIn}>
          <Lock data-icon="inline-start" />
          {t('games.spectrum.lockIn')}
        </Button>
      </div>
    )
  }

  if (stage.kind === 'result') {
    const points = turn.points ?? 0
    return (
      <div className="flex flex-col gap-4 px-4 pb-8">
        <p className="text-center text-sm text-muted-foreground">{progress}</p>
        <SpectrumDial left={left} right={right} value={turn.guess} target={turn.target} label={t('games.spectrum.dialLabel', { left, right })} />
        <div className={cn('game-pop flex flex-col items-center gap-1 rounded-3xl p-5 text-center', points >= 3 ? tintClass(4) : points > 0 ? tintClass(3) : 'bg-muted')} role="status">
          <span className="text-4xl font-medium">+{points}</span>
          <span className="text-sm opacity-80">{t(`games.spectrum.verdict.${points}` as 'games.spectrum.verdict.0')}</span>
        </div>
        <p className="text-center text-sm text-muted-foreground">{t('games.spectrum.totalSoFar', { total, max: (round + 1) * MAX_POINTS })}</p>
        <Button size="lg" onClick={next}>
          {round + 1 < cards.length ? t('games.spectrum.nextRound') : t('games.spectrum.seeResult')}
        </Button>
      </div>
    )
  }

  const level = rating(total, cards.length)
  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <div className={cn('game-pop flex flex-col items-center gap-2 rounded-3xl p-6 text-center', tintClass(8))}>
        <Trophy className="size-14" aria-hidden="true" />
        <span className="text-5xl font-medium tabular-nums" role="status">
          {total} / {cards.length * MAX_POINTS}
        </span>
        <span className="text-2xl font-medium">{t(`games.spectrum.rating.${level}.title`)}</span>
        <span className="max-w-xs text-sm opacity-80">{t(`games.spectrum.rating.${level}.text`)}</span>
      </div>
      <Button size="lg" onClick={start}>
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
