import { useTranslation } from 'react-i18next'
import { Clock, Info, UserRound } from 'lucide-react'
import type { MeetupListItem } from '@/api/types'
import { AvatarStack } from '@/components/common/AvatarStack'
import { formatDayLabel, formatTime, formatTimeUntil } from '@/lib/date'
import { cn } from '@/lib/utils'
import { HideMeetupButton } from './HideMeetupButton'

type InviteCardProps = {
  meetup: MeetupListItem
  now: Date
  /** Shown only when I may hide it (not my own meetup, decision #32). */
  onHide?: () => void
  /** "ดูรายละเอียด" button (the whole card can also be tapped). */
  onOpen?: () => void
  /** Full-page deck: more details on the card. */
  tall?: boolean
}

// Face of an invite in the swipe deck: which gang, what, when, who is going.
// Sits on the tangerine `on-slab` surface the deck gives it (#97), so every colour here comes from tokens.
export function InviteCard({ meetup, now, onHide, onOpen, tall }: InviteCardProps) {
  const { t } = useTranslation()
  const startsAt = new Date(meetup.startsAt)
  const countdown = formatTimeUntil(startsAt, now)
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 text-sm font-semibold'
  return (
    <div className="flex flex-1 flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="truncate rounded-full bg-card px-2.5 text-[13px] leading-6 font-semibold">{meetup.gangName}</span>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={t('meetup.openDetails', { title: meetup.title })}
            className="pressable -mt-1.5 -mr-1.5 grid size-9 shrink-0 place-items-center rounded-full"
          >
            <Info className="size-5" />
          </button>
        )}
      </div>
      <h3 className={cn('leading-tight font-bold text-balance', tall ? 'text-[32px]' : 'text-[28px]')}>{meetup.title}</h3>
      <p className="flex flex-wrap items-center gap-2">
        <span className={chip}>
          <Clock className="size-4" aria-hidden="true" />
          {formatDayLabel(startsAt, now)} {formatTime(startsAt)}
        </span>
        {countdown && <span className={chip}>{countdown}</span>}
      </p>
      <p className="flex items-center gap-2.5 text-sm">
        <AvatarStack names={meetup.goingAvatars.map((p) => p.displayName)} total={meetup.counts.going} ringClass="ring-tangerine" avatarClass="bg-ink text-ink-foreground" />
        {t('meetup.countsShort', { going: meetup.counts.going, maybe: meetup.counts.maybe })}
      </p>
      {tall && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserRound className="size-4" aria-hidden="true" />
          {t('meetup.createdBy', { name: meetup.createdBy.displayName })}
        </p>
      )}
      {onHide && (
        <div className="mt-auto -mb-3 flex justify-center">
          <HideMeetupButton onClick={onHide} />
        </div>
      )}
    </div>
  )
}
