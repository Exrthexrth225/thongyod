import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Bomb, Eye, Flag, Play, RotateCcw, Settings2, Trophy } from 'lucide-react'
import { SectionHeader } from '@/components/common/SectionHeader'
import { BottomAction } from '@/components/games/BottomAction'
import { PackPicker } from '@/components/games/PackPicker'
import { Button } from '@/components/ui/button'
import { WORD_PACKS } from '@/config/wordPacks'
import { markDone } from '@/features/daily/daily'
import { celebrate } from '@/lib/celebrate'
import { gameDeck } from '@/lib/deck'
import { useGameSettings } from '@/lib/gameSettings'
import { buzz, playSound, unlockSound } from '@/lib/sound'
import { useGameSound } from '@/lib/soundPrefs'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { MAX_WORD_LENGTH, dealBoard, endTurn, left, openCard, visibleLength, type CodeCard, type CodeGame, type Team } from './logic'
import '@/components/games/games.css'

type Settings = { packs: string[] }
const DEFAULTS: Settings = { packs: ['food', 'animals', 'things', 'places', 'jobs', 'sports'] }
const fix = (raw: Partial<Settings>): Settings => {
  const packs = (raw.packs ?? []).filter((id) => WORD_PACKS.some((p) => p.id === id))
  return { packs: packs.length ? packs : DEFAULTS.packs }
}

/** Team colours: tint 1 and tint 5 in every theme. */
const TEAM_TINT: Record<Team, number> = { a: 1, b: 5 }

const deck = gameDeck('codewords')

function cardClass(card: CodeCard, show: boolean) {
  if (!card.revealed && !show) return 'border bg-card text-card-foreground'
  // While peeking / at the end, opened cards fade so the leader sees what is still to find (the bomb never fades).
  const faded = show && card.revealed ? 'opacity-40' : ''
  if (card.owner === 'bomb') return 'bg-foreground text-background'
  if (card.owner === 'neutral') return cn('bg-muted text-muted-foreground', !show && 'line-through', faded)
  return cn(tintClass(TEAM_TINT[card.owner]), faded)
}

// ทีมคำใบ้ on one phone: the board lies on the table; each team's leader holds a button to peek at the key,
// says one word + a number, and the team opens cards (tap twice). Bomb = that team loses.
export function CodewordsGame() {
  const { t } = useTranslation()
  const sound = useGameSound('codewords')
  const [settings, setSettings] = useGameSettings<Settings>('codewords', DEFAULTS, fix)
  const [game, setGame] = useState<CodeGame | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [peek, setPeek] = useState(false)

  const teamName = (team: Team) => t(`games.codewords.teams.${team}`)

  function start() {
    unlockSound()
    const pool = WORD_PACKS.filter((p) => settings.packs.includes(p.id))
      .flatMap((p) => p.words)
      .filter((w) => visibleLength(w) <= MAX_WORD_LENGTH)
    const words = deck.order(pool, (w) => w)
    const next = dealBoard(words)
    deck.markSeen(next.cards.map((c) => c.word))
    setGame(next)
    setSelected(null)
    markDone('tool')
  }

  function tap(index: number) {
    if (!game || game.winner || game.cards[index].revealed) return
    if (selected !== index) {
      setSelected(index)
      return
    }
    const card = game.cards[index]
    const next = openCard(game, index)
    setGame(next)
    setSelected(null)
    if (next.winner) {
      if (sound) playSound(next.end === 'bomb' ? 'boom' : 'end')
      buzz(next.end === 'bomb' ? [120, 60, 120] : [40, 40, 40])
      if (next.end === 'cleared') celebrate()
    } else if (card.owner === game.turn) {
      if (sound) playSound('correct')
      buzz(30)
    } else {
      if (sound) playSound('wrong')
      buzz([60, 40, 60])
    }
  }

  const peekKeys = {
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setPeek(true)
      }
    },
    onKeyUp: () => setPeek(false),
  }

  if (!game) {
    return (
      <div className="flex flex-col gap-3 pb-28">
        <ol className="mx-3 grid gap-2 rounded-2xl border bg-card p-4 text-sm">
          {(['teams', 'clue', 'open'] as const).map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{i + 1}</span>
              <span>{t(`games.codewords.how.${step}`)}</span>
            </li>
          ))}
        </ol>
        <SectionHeader title={t('games.party.packsTitle')} />
        <PackPicker
          multiple
          label={t('games.party.packsTitle')}
          value={settings.packs}
          onChange={(packs) => setSettings((s) => fix({ ...s, packs }))}
          packs={WORD_PACKS.map((p) => ({ id: p.id, icon: p.icon, tint: p.tint, name: t(`headsUp.packs.${p.id}.name`), meta: t('headsUp.wordsCount', { count: p.words.length }) }))}
        />
        <BottomAction>
          <Button size="lg" className="flex-1" onClick={start}>
            <Play data-icon="inline-start" />
            {t('games.start')}
          </Button>
        </BottomAction>
      </div>
    )
  }

  const over = game.winner !== null
  const show = peek || over

  return (
    <div className="flex flex-col gap-3 px-3 pb-8">
      <div className="grid grid-cols-2 gap-2">
        {(['a', 'b'] as const).map((team) => (
          <div
            key={team}
            className={cn(
              'flex items-center justify-between rounded-2xl px-3 py-2 transition-opacity',
              tintClass(TEAM_TINT[team]),
              !over && game.turn !== team && 'opacity-50',
              !over && game.turn === team && 'ring-2 ring-foreground',
            )}
          >
            <span className="text-sm font-medium">{teamName(team)}</span>
            <span className="text-sm tabular-nums">{t('games.codewords.left', { count: left(game, team) })}</span>
          </div>
        ))}
      </div>

      {over ? (
        <div className={cn('game-pop flex items-center gap-3 rounded-2xl p-4', tintClass(TEAM_TINT[game.winner!]))} role="status">
          {game.end === 'bomb' ? <Bomb className="size-8 shrink-0" aria-hidden="true" /> : <Trophy className="size-8 shrink-0" aria-hidden="true" />}
          <span className="flex flex-col">
            <span className="text-lg font-medium">{t('games.codewords.wins', { team: teamName(game.winner!) })}</span>
            <span className="text-sm opacity-80">{game.end === 'bomb' ? t('games.codewords.byBomb', { team: teamName(game.winner === 'a' ? 'b' : 'a') }) : t('games.codewords.byCleared')}</span>
          </span>
        </div>
      ) : (
        <p className="text-center text-sm" aria-live="polite">
          <b className="font-medium">{t('games.codewords.turn', { team: teamName(game.turn) })}</b> · {t('games.codewords.tapTwice')}
        </p>
      )}

      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t('games.codewords.board')}>
        {game.cards.map((card, i) => (
          <button
            key={card.word}
            type="button"
            onClick={() => tap(i)}
            disabled={over || card.revealed}
            aria-pressed={selected === i}
            className={cn(
              'flex h-16 items-center justify-center rounded-xl px-1 text-center text-[13px] leading-tight font-medium break-words transition-colors',
              cardClass(card, show),
              selected === i && !show && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              card.revealed && !show && 'game-pop',
            )}
          >
            {card.owner === 'bomb' && (card.revealed || show) ? (
              <span className="flex flex-col items-center gap-0.5">
                <Bomb className="size-4" aria-hidden="true" />
                {card.word}
              </span>
            ) : (
              card.word
            )}
          </button>
        ))}
      </div>

      {over ? (
        <>
          <Button size="lg" onClick={start}>
            <RotateCcw data-icon="inline-start" />
            {t('games.playAgain')}
          </Button>
          <Button variant="outline" onClick={() => setGame(null)}>
            <Settings2 data-icon="inline-start" />
            {t('games.changeSettings')}
          </Button>
        </>
      ) : (
        <>
          <Button
            size="lg"
            variant={peek ? 'default' : 'outline'}
            className="touch-none select-none"
            aria-pressed={peek}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setPeek(true)
              setSelected(null)
            }}
            onPointerUp={() => setPeek(false)}
            onPointerCancel={() => setPeek(false)}
            onContextMenu={(e) => e.preventDefault()}
            {...peekKeys}
          >
            <Eye data-icon="inline-start" />
            {peek ? t('games.codewords.peeking') : t('games.codewords.holdToPeek')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setGame(endTurn(game))
              setSelected(null)
              if (sound) playSound('pass')
            }}
          >
            <Flag data-icon="inline-start" />
            {t('games.codewords.endTurn', { team: teamName(game.turn) })}
          </Button>
        </>
      )}
    </div>
  )
}
