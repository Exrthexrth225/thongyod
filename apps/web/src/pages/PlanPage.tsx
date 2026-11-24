import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { useMeetupsInRange } from '@/api/meetups'
import type { MeetupListItem } from '@/api/types'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SeeAllLink } from '@/components/common/SeeAllLink'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { ROUND_BUTTON, TabHeader } from '@/components/layout/TabHeader'
import { MeetupCard } from '@/components/meetup/MeetupCard'
import { StartMeetupCard } from '@/components/meetup/StartMeetupCard'
import { Button } from '@/components/ui/button'
import { TOOLS, type ToolId } from '@/config/tools'
import { billStatus } from '@/features/bill-split/bill'
import { BillRow } from '@/features/bill-split/BillRow'
import { useBills } from '@/features/bill-split/storage'
import { addDays, formatDayLabel, startOfDay } from '@/lib/date'

type View = 'upcoming' | 'past'
/** The API allows up to 93 days per request (DECISIONS #40). */
const DAYS = 60
const PLAN_TOOLS: ToolId[] = ['quickVote', 'restaurantVote', 'randomRestaurant', 'splitBill']
const OPEN_BILLS = 3
/** Meetups shown before "ดูอีก N นัด", so the tools below stay one scroll away. */
const FIRST_MEETUPS = 5

// The นัด tab (#132): start a meetup, my meetups by day (upcoming, or past ones I went to),
// the tools for planning, and bills that are not settled yet.
export function PlanPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [view, setView] = useState<View>(params.get('view') === 'past' ? 'past' : 'upcoming')
  const [showAll, setShowAll] = useState(false)
  const range = useMemo(() => {
    const today = startOfDay(new Date())
    return view === 'upcoming'
      ? { from: today.toISOString(), to: addDays(today, DAYS).toISOString() }
      : { from: addDays(today, -DAYS).toISOString(), to: today.toISOString() }
  }, [view])
  const meetups = useMeetupsInRange(range.from, range.to)

  const days = useMemo(() => {
    const list = (meetups.data ?? []).filter((m) => (view === 'past' ? m.myResponse === 'going' : true))
    list.sort((a, b) => (view === 'past' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)))
    const shown = showAll ? list : list.slice(0, FIRST_MEETUPS)
    const groups = new Map<string, MeetupListItem[]>()
    for (const m of shown) {
      const key = startOfDay(new Date(m.startsAt)).toISOString()
      groups.set(key, [...(groups.get(key) ?? []), m])
    }
    return { groups: [...groups.entries()], hidden: list.length - shown.length }
  }, [meetups.data, view, showAll])

  const bills = useBills()
  const openBills = useMemo(() => bills.filter((b) => billStatus(b).status !== 'cleared').slice(0, OPEN_BILLS), [bills])
  const tools = PLAN_TOOLS.map((id) => TOOLS.find((tool) => tool.id === id)!)

  return (
    <div className="flex flex-col gap-4 pb-6">
      <TabHeader title={t('nav.plan')}>
        <Link to="/calendar" className={ROUND_BUTTON} aria-label={t('calendar.open')}>
          <CalendarDays className="size-[22px]" aria-hidden="true" />
        </Link>
      </TabHeader>

      <div className="flex flex-col gap-3 px-4">
        <StartMeetupCard />
        <SegmentedChoice<View>
          label={t('myMeetups.title')}
          value={view}
          onChange={(next) => {
            setView(next)
            setShowAll(false)
          }}
          options={[
            { value: 'upcoming', label: t('myMeetups.upcoming') },
            { value: 'past', label: t('myMeetups.past') },
          ]}
        />
      </div>

      {meetups.isPending ? (
        <LoadingState rows={3} />
      ) : meetups.isError ? (
        <ErrorState onRetry={() => void meetups.refetch()} />
      ) : days.groups.length === 0 ? (
        <div className="px-4">
          <EmptyState title={view === 'upcoming' ? t('myMeetups.emptyUpcoming') : t('myMeetups.emptyPast')} />
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 px-4">
          {days.groups.map(([day, list]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="pl-1 text-sm font-semibold text-muted-foreground">{formatDayLabel(new Date(day))}</h2>
              {list.map((m) => (
                <MeetupCard key={m.id} meetup={m} />
              ))}
            </section>
          ))}
          {days.hidden > 0 && (
            <Button variant="secondary" onClick={() => setShowAll(true)}>
              {t('plan.showMore', { count: days.hidden })}
            </Button>
          )}
        </div>
      )}

      <section>
        <SectionHeader title={t('plan.tools')} />
        <div className="grid grid-cols-2 gap-2.5 px-4">
          {tools.map((tool) => (
            <Link key={tool.id} to={tool.to!} className="pressable flex items-center gap-2.5 rounded-[20px] bg-card p-3">
              <img src={tool.art} alt="" className="size-11 shrink-0" draggable={false} />
              <span className="min-w-0">
                <span className="block text-sm leading-tight font-semibold">{t(`tools.${tool.id}.title`)}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{t(`tools.${tool.id}.desc`)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {openBills.length > 0 && (
        <section>
          <SectionHeader
            title={t('plan.openBills')}
            action={<SeeAllLink to="/bills" />}
          />
          <ul className="flex flex-col gap-2 px-4">
            {openBills.map((bill) => (
              <BillRow key={bill.id} bill={bill} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
