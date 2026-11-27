import { RoomAccess } from '@/features/rooms/RoomAccess'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, MonitorSmartphone, ScanLine, Smartphone, Users } from 'lucide-react'
import multiDeviceArt from '@/assets/tools/multiDevice.webp'
import { isRoomCode } from '@/api/rooms'
import { SectionHeader } from '@/components/common/SectionHeader'
import { ScanDialog } from '@/components/scan/ScanDialog'
import { GAMES, type Game } from '@/config/games'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { softTintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'

/** Games with a shared Board Screen (an iPad on the table). */
const WITH_BOARD = new Set(['boss'])
/** Newest first, shown big. */
const FEATURED = 'boss'

// /games/rooms — "เล่นหลายเครื่อง": join a friend's room by code / QR, or pick a game and open a room (DECISIONS #76, #136).
export function RoomsPage() {
  return <RoomAccess><RoomsPageContent /></RoomAccess>
}

function RoomsPageContent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [scan, setScan] = useState(false)
  const roomGames = GAMES.filter((g) => g.rooms && g.status === 'ready')
  const featured = roomGames.find((g) => g.id === FEATURED)
  const rest = roomGames.filter((g) => g.id !== FEATURED)
  const open = (g: Game) => void navigate(`/games/rooms/new?game=${g.id}`)
  const players = (g: Game) => (g.players[0] === g.players[1] ? t('games.playersOne', { count: g.players[0] }) : t('games.players', { min: g.players[0], max: g.players[1] }))

  function join(e: FormEvent) {
    e.preventDefault()
    if (isRoomCode(code)) void navigate(`/games/rooms/${code}`)
  }

  return (
    <div className="flex flex-col gap-2 pb-8">
      <PageHeader title={t('rooms.zoneTitle')} subtitle={t('rooms.zoneSubtitle')} backTo="/games" />

      <section className="mx-4 flex items-center gap-3 rounded-[24px] bg-card p-4">
        <img src={multiDeviceArt} alt="" className="size-14 shrink-0" draggable={false} />
        <p className="text-sm leading-snug">{t('rooms.howItWorks')}</p>
      </section>

      <SectionHeader title={t('rooms.joinTitle')} />
      <form onSubmit={join} className="mx-4 flex flex-col gap-2.5 rounded-[24px] bg-card p-4">
        <label htmlFor="room-code" className="sr-only">{t('rooms.codeLabel')}</label>
        <div className="flex gap-2">
          <Input
            id="room-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-13 flex-1 rounded-2xl text-center text-2xl font-semibold tracking-[0.35em] tabular-nums"
            aria-label={t('rooms.codeLabel')}
          />
          <Button type="button" variant="secondary" size="icon" className="size-13 rounded-2xl" aria-label={t('rooms.scanQr')} onClick={() => setScan(true)}>
            <ScanLine className="size-6" />
          </Button>
        </div>
        <Button type="submit" size="lg" className="h-12 rounded-2xl" disabled={!isRoomCode(code)}>
          {t('rooms.join')}
          <ArrowRight data-icon="inline-end" />
        </Button>
        <p className="text-xs text-muted-foreground">{t('rooms.joinHint')}</p>
      </form>

      <SectionHeader title={t('rooms.pickGame')} />
      {featured && (
        <button type="button" onClick={() => open(featured)} className={cn('pressable relative mx-4 flex items-center gap-3 overflow-hidden rounded-[24px] p-4 text-left', softTintClass(featured.tint))}>
          <img src={featured.art} alt="" className="size-20 shrink-0 drop-shadow-[0_3px_0_rgb(0_0_0/0.12)]" draggable={false} />
          <span className="min-w-0 flex-1">
            <span className="mb-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{t('rooms.newBadge')}</span>
            <span className="block font-heading text-xl leading-tight font-bold">{t(`games.list.${featured.id}.title`)}</span>
            <span className="block text-sm leading-snug opacity-85">{t(`games.list.${featured.id}.desc`)}</span>
            <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-85">
              <span className="flex items-center gap-1"><Users className="size-3" aria-hidden="true" />{players(featured)}</span>
              {WITH_BOARD.has(featured.id) && <span className="flex items-center gap-1"><MonitorSmartphone className="size-3" aria-hidden="true" />{t('rooms.boardHint')}</span>}
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
        </button>
      )}
      <ul className="mx-4 grid grid-cols-2 gap-2">
        {rest.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => open(g)} className={cn('pressable flex h-full min-h-40 w-full flex-col items-start gap-0.5 rounded-[24px] p-3.5 text-left', softTintClass(g.tint))}>
              {g.art ? <img src={g.art} alt="" draggable={false} className="-ml-1 size-14" /> : <g.icon className="size-12 p-1.5" aria-hidden="true" />}
              <span className="mt-1 font-heading text-lg leading-snug font-bold">{t(`games.list.${g.id}.title`)}</span>
              <span className="line-clamp-2 text-[13px] leading-snug opacity-85">{t(`games.list.${g.id}.desc`)}</span>
              <span className="mt-auto flex items-center gap-1 pt-2 text-xs opacity-85"><Users className="size-3" aria-hidden="true" />{players(g)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mx-4 mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Smartphone className="size-4 shrink-0" aria-hidden="true" />
        {t('rooms.moreSoon')}
      </p>

      <ScanDialog open={scan} onOpenChange={setScan} />
    </div>
  )
}
