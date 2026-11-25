import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { PendingItem } from '@thongyod/shared'
import type { MeetupListItem } from '@/api/types'
import inviteArt from '@/assets/tools/invite.webp'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SeeAllLink } from '@/components/common/SeeAllLink'
import { Button } from '@/components/ui/button'
import { PENDING_ART } from '@/config/pending'
import { useMeetupActions } from '@/features/meetups/useMeetupActions'
import { formatDayLabel, formatTime } from '@/lib/date'
import { pendingSubtitle, pendingTitle } from '@/lib/describe'

/** Home previews this many rows; each category keeps its own full-list destination. */
const PREVIEW = 3

type Props = { invites: MeetupListItem[]; pending: PendingItem[]; now: Date }

function Row({ art, title, subtitle, to, children }: { art: string; title: string; subtitle: string; to?: string; children?: React.ReactNode }) {
  const body = (
    <>
      <img src={art} alt="" className="size-12 shrink-0 object-contain" draggable={false} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>
      </span>
    </>
  )
  return (
    <li className="flex items-center gap-3 px-2.5 py-2">
      {to ? (
        <Link to={to} className="pressable flex min-w-0 flex-1 items-center gap-3">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      {children}
    </li>
  )
}

// "รอเราตอบ" (#132): invites and everything else waiting for me in ONE box, answered right in the row.
// Invites get ไป / ไม่ไป (tap the row for อาจจะ and details); "ตอบทีละใบ" opens the full-screen swipe deck.
// Votes and bills only say what is waiting until their APIs exist (Codex plan, docs/BACKEND_PLAN_PENDING.md).
export function WaitingBox({ invites, pending, now }: Props) {
  const { t } = useTranslation()
  const actions = useMeetupActions()
  const total = invites.length + pending.length
  if (total === 0) return null
  const shownInvites = invites.slice(0, PREVIEW)
  const shownPending = pending.slice(0, PREVIEW - shownInvites.length)
  return (
    <section>
      <SectionHeader
        title={t('home.waitingHeading')}
        count={total}
        action={
          <span className="flex items-center gap-1">
            {invites.length > 0 && (
              <Link to="/invites" className="pressable rounded-full bg-card px-3 py-1 text-sm font-semibold">
                {t('home.oneByOne')}
              </Link>
            )}
          </span>
        }
      />
      <ul className="mx-4 rounded-3xl bg-card p-1.5">
        {shownInvites.map((m) => {
          const at = new Date(m.startsAt)
          return (
            <Row
              key={m.id}
              art={inviteArt}
              to={`/meetups/${m.id}?invite=1`}
              title={m.title}
              subtitle={t('home.invitedBy', { name: m.createdBy.displayName, when: `${formatDayLabel(at, now)} ${formatTime(at)}` })}
            >
              <Button size="sm" onClick={() => actions.answer(m, 'going')}>
                {t('meetup.going')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => actions.answer(m, 'not_going')}>
                {t('meetup.notGoing')}
              </Button>
            </Row>
          )
        })}
        {shownPending.map((item) => (
          <Row key={item.id} art={PENDING_ART[item.kind]} title={pendingTitle(item)} subtitle={pendingSubtitle(item, now)} />
        ))}
      </ul>
      {pending.length > 0 && (
        <div className="mx-4 flex justify-end px-2.5 pt-2">
          <SeeAllLink to="/pending" label={t('home.otherPending', { count: pending.length })} />
        </div>
      )}
    </section>
  )
}
