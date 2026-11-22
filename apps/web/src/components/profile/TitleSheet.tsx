import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Award, CalendarDays, ChevronRight, Flame, Sparkles, Users } from 'lucide-react'
import type { PersonRef } from '@/api/types'
import { Avatar } from '@/components/common/Avatar'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { HARSH_TITLES, isTitleKey } from '@/config/titles'
import { formatMonthYear } from '@/lib/date'

export type TitleInfo = {
  key: string | null
  name: string
  earnedAt: string
  gangName?: string | null
  meetup?: { id: string; title: string } | null
  /** Who holds it (gang page). Leave out on a person's own profile. */
  holder?: PersonRef
}

type TitleSheetProps = { title: TitleInfo | null; onClose: () => void; holderLink?: string }

// Tap a ฉายา → what it is and how it was earned (#117): the rule, where (gang), when, and the meetup that did it.
export function TitleSheet({ title, onClose, holderLink }: TitleSheetProps) {
  const { t } = useTranslation()
  const known = isTitleKey(title?.key) ? title.key : null
  return (
    <BottomSheet open={title !== null} onOpenChange={(open) => !open && onClose()} title={t('titles.sheetTitle')}>
      {title && (
        <div className="flex flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="num-pop grid size-20 place-items-center rounded-full bg-yolk text-on-slab ring-4 ring-ink">
              <Award className="size-10" aria-hidden="true" />
            </span>
            <p className="font-heading text-2xl font-bold">{title.name}</p>
            {known && HARSH_TITLES.has(known) && (
              <span className="flex items-center gap-1 rounded-full bg-tangerine px-2.5 py-0.5 text-xs font-semibold text-on-slab">
                <Flame className="size-3.5" aria-hidden="true" />
                {t('titles.harsh')}
              </span>
            )}
          </div>

          <div className="rounded-3xl bg-muted/60 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4 text-brand" aria-hidden="true" />
              {t('titles.howTitle')}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed">{known ? t(`titles.catalog.${known}`) : t('titles.unknownHow')}</p>
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {title.gangName ? t('titles.inGang', { gang: title.gangName }) : t('titles.noGang')}
            </li>
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {t('profile.earnedOn', { date: formatMonthYear(new Date(title.earnedAt)) })}
            </li>
          </ul>

          {title.meetup && (
            <Link to={`/meetups/${title.meetup.id}`} onClick={onClose} className="pressable flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-border">
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{t('titles.fromMeetup')}</span>
                <span className="block truncate font-semibold">{title.meetup.title}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          )}

          {title.holder && holderLink && (
            <Link to={holderLink} onClick={onClose} className="pressable flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-border">
              <Avatar name={title.holder.displayName} src={title.holder.avatarUrl} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{t('titles.holder')}</span>
                <span className="block truncate font-semibold">{title.holder.displayName}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
