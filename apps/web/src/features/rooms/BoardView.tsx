import { useTranslation } from 'react-i18next'
import { Hand, Hourglass } from 'lucide-react'
import type { PartyRoomData, Room, SpyRoomData } from '@/api/types'
import { Avatar } from '@/components/common/Avatar'
import { QrCodeCard } from '@/components/friends/QrCodeCard'
import { cn } from '@/lib/utils'
import { roomUrl } from './url'
import { useSecondsLeft } from './useSecondsLeft'
import { BossTableScreen } from '@/features/boss/BossRoom'
import '@/components/games/games.css'

/** What the shared Board Screen shows: only public data (the server sends no secrets to a board). */
export function BoardView({ room }: { room: Room }) {
  return (
    <div className="flex min-h-full flex-col justify-center pb-10">
      {room.state === 'lobby' ? <BoardLobby room={room} /> : room.game === 'spy' ? <SpyBoard room={room} /> : room.game === 'boss' ? (room.boss ? <BossTableScreen room={room} /> : null) : <PartyBoard room={room} />}
    </div>
  )
}

function BoardLobby({ room }: { room: Room }) {
  const { t } = useTranslation()
  const host = room.players.find((p) => p.isHost)?.displayName ?? '?'
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-6 text-center">
      <h1 className="text-4xl font-extrabold">{t(`games.list.${room.game}.title`)}</h1>
      <div className="flex flex-wrap items-center justify-center gap-8">
        <QrCodeCard value={roomUrl(room.code)} label={t('rooms.qrTitle')} />
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('rooms.codeLabel')}</span>
          <span className="text-6xl font-extrabold tracking-[0.2em] tabular-nums">{room.code}</span>
          <span className="text-sm text-muted-foreground">{t('rooms.qrHint')}</span>
        </div>
      </div>
      <BoardPlayers room={room} />
      <p className="flex items-center gap-2 text-lg text-muted-foreground">
        <Hourglass className="game-breathe size-5" aria-hidden="true" />
        {t('rooms.waitHost', { name: host })}
      </p>
    </div>
  )
}

function BoardPlayers({ room, highlight = [], extra }: { room: Room; highlight?: string[]; extra?: (id: string) => React.ReactNode }) {
  return (
    <ul className="flex flex-wrap justify-center gap-3">
      {room.players.map((p) => (
        <li key={p.userId} className={cn('game-card-in flex min-w-28 flex-col items-center gap-1.5 rounded-3xl bg-card px-4 py-3', highlight.includes(p.userId) && 'bg-foreground text-background')}>
          <Avatar name={p.displayName} src={p.avatarUrl} className={cn('size-14 md:size-20', !room.online.includes(p.userId) && 'opacity-50 grayscale')} />
          <span className="max-w-32 truncate text-base font-medium md:text-lg">{p.displayName}</span>
          {extra?.(p.userId)}
        </li>
      ))}
    </ul>
  )
}

function SpyBoard({ room }: { room: SpyRoomData }) {
  const { t } = useTranslation()
  const round = room.round
  const left = useSecondsLeft(round?.endsAt ?? null)
  const name = (id: string) => room.players.find((p) => p.userId === id)?.displayName ?? '?'
  const reveal = round?.reveal
  const over = round?.timeUp || left === 0
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-6 text-center">
      {round && <span className="text-lg text-muted-foreground">{t('rooms.round', { n: round.number })}</span>}
      {reveal ? (
        <div className="game-pop flex flex-col items-center gap-3">
          <span className="text-xl text-muted-foreground">{t('rooms.board.spies')}</span>
          <span className="text-5xl font-extrabold">{reveal.spyIds.map(name).join(' · ')}</span>
          <span className="mt-4 text-xl text-muted-foreground">{reveal.spyWord ? t('rooms.board.words') : t('rooms.board.place')}</span>
          <span className="text-4xl font-bold">{reveal.spyWord ? `${reveal.secret} / ${reveal.spyWord}` : reveal.secret}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <span className={cn('text-[clamp(4rem,18vw,10rem)] leading-none font-extrabold tabular-nums', over && 'text-tone-warning-foreground')} role="timer" aria-live="off">
            {over ? t('rooms.board.timeUp') : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
          </span>
          {round && <span className="text-2xl">{t('rooms.firstAsks', { name: name(round.firstPlayerId) })}</span>}
        </div>
      )}
      <BoardPlayers room={room} highlight={reveal?.spyIds} />
    </div>
  )
}

function PartyBoard({ room }: { room: PartyRoomData }) {
  const { t } = useTranslation()
  const round = room.round
  if (!round) return null
  const name = (id: string) => room.players.find((p) => p.userId === id)?.displayName ?? '?'
  const result = round.result
  const ranked = result && room.game === 'mostLikely' ? Object.entries(result.tally).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : []
  const top = ranked[0]?.[1] ?? 0
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-6 text-center">
      <span className="text-lg text-muted-foreground">{t('rooms.round', { n: round.number })}</span>
      <p className="game-pop text-[clamp(2rem,6vw,3.5rem)] leading-tight font-extrabold text-balance">{round.card}</p>
      {!result && <span className="text-2xl text-muted-foreground">{t('rooms.party.answered', { n: round.votedIds.length, total: room.players.length })}</span>}
      {result && room.game === 'mostLikely' && (
        <ol className="flex w-full max-w-2xl flex-col gap-2">
          {ranked.length === 0 && <li className="text-xl text-muted-foreground">{t('rooms.party.noVotes')}</li>}
          {ranked.map(([id, n]) => (
            <li key={id} className="flex items-center gap-3">
              <span className="w-40 truncate text-right text-xl font-medium">{name(id)}</span>
              <span className="h-10 rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(8, (n / top) * 60)}%` }} />
              <span className="text-2xl font-bold tabular-nums">{n}</span>
            </li>
          ))}
        </ol>
      )}
      {result && room.game === 'neverHave' && (
        <span className="text-3xl font-bold">{result.haveIds.length ? `${t('rooms.party.whoHas')}: ${result.haveIds.map(name).join(' · ')}` : t('rooms.party.nobody')}</span>
      )}
      <BoardPlayers
        room={room}
        highlight={result ? result.haveIds : round.votedIds}
        extra={room.fingers ? (id) => (
          <span className="flex items-center gap-1 text-sm tabular-nums" aria-label={t('rooms.board.fingers', { count: room.fingers?.[id] ?? 0 })}>
            <Hand className="size-4" aria-hidden="true" />{room.fingers?.[id] ?? 0}
          </span>
        ) : undefined}
      />
    </div>
  )
}
