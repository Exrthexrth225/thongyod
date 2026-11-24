import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AvatarStack } from '@/components/common/AvatarStack'
import type { MeetupListItem } from '@/api/types'
import { formatTime } from '@/lib/date'
import { ResponseChip } from './ResponseChip'

// One meetup as its own card on the นัด tab (#132): big time | title, gang, who is going | my answer.
// MeetupRow stays for compact lists inside another card (gang page, profile).
export function MeetupCard({ meetup }: { meetup: MeetupListItem }) {
  const { t } = useTranslation()
  const going = meetup.counts.going
  return (
    <Link to={`/meetups/${meetup.id}`} className="pressable flex items-center gap-3.5 rounded-[22px] bg-card p-3.5">
      <span className="w-14 shrink-0 text-center">
        <span className="block font-heading text-xl leading-tight font-bold tabular-nums">{formatTime(new Date(meetup.startsAt))}</span>
        <span className="text-xs text-muted-foreground">{t('plan.timeUnit')}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{meetup.title}</span>
        <span className="block truncate text-sm text-muted-foreground">{meetup.gangName}</span>
        {going > 0 && (
          <span className="mt-1.5 flex items-center gap-2.5">
            <AvatarStack names={meetup.goingAvatars.map((p) => p.displayName)} total={going} />
            <span className="text-xs text-muted-foreground">{t('plan.goingCount', { count: going })}</span>
          </span>
        )}
      </span>
      <ResponseChip response={meetup.myResponse} />
    </Link>
  )
}
