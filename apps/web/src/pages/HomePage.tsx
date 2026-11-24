import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHome } from '@/api/home'
import { useMe } from '@/api/profile'
import { useMeetupsInRange } from '@/api/meetups'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SeeAllLink } from '@/components/common/SeeAllLink'
import { FirstRunCard } from '@/components/home/FirstRunCard'
import { HomeActions } from '@/components/home/HomeActions'
import { HomeHeader } from '@/components/home/HomeHeader'
import { KeepPlaying } from '@/components/home/KeepPlaying'
import { WaitingBox } from '@/components/home/WaitingBox'
import { WeekStrip } from '@/components/home/WeekStrip'
import { MeetupRow } from '@/components/meetup/MeetupRow'
import { isLocked } from '@/features/meetups/derive'
import { homeRange } from '@/features/meetups/useWaiting'
import { addDays, formatDayLabel, isSameDay, startOfWeek } from '@/lib/date'

// หน้าหลัก (#132): one job, "what needs me today". Top to bottom: hello, รอเราตอบ (answer in place), this week,
// the main actions, and the last games played. Friends' updates moved to แก๊ง; the pet is hidden (PETS_ENABLED).
export function HomePage() {
  const { t } = useTranslation()
  const now = useMemo(() => new Date(), [])
  const [selectedDay, setSelectedDay] = useState(now)

  useEffect(() => {
    document.title = t('app.title')
  }, [t])

  // One request covers this week (week strip + agenda) and the next 2 weeks (invites waiting for me).
  const range = useMemo(() => homeRange(now), [now])
  const meetupsQuery = useMeetupsInRange(range.from, range.to)
  const homeQuery = useHome()
  const me = useMe()

  const meetups = (meetupsQuery.data ?? []).filter((m) => !m.myState.hidden)
  const weekEnd = addDays(startOfWeek(now), 7)
  const weekMeetups = meetups.filter((m) => new Date(m.startsAt) < weekEnd)
  const invites = meetups.filter((m) => m.myResponse === null && !isLocked(m, now))
  const inviteIds = new Set(invites.map((m) => m.id))
  const dayMeetups = weekMeetups.filter((m) => isSameDay(new Date(m.startsAt), selectedDay))
  const agenda = dayMeetups.filter((m) => !inviteIds.has(m.id))

  return (
    <div className="flex flex-col gap-5 pb-8">
      <HomeHeader name={me.data?.displayName ?? null} now={now} />

      {/* New users only; hides itself when done (#96). */}
      <FirstRunCard />

      <WaitingBox invites={invites} pending={homeQuery.data?.pending ?? []} now={now} />

      <section>
        <SectionHeader title={t('home.thisWeek')} count={t('home.weekCount', { count: weekMeetups.length })} action={<SeeAllLink to="/calendar" label={t('calendar.open')} />} />
        <div className="mx-4 flex flex-col gap-1 rounded-3xl bg-card px-1 pt-2 pb-1.5">
          <WeekStrip today={now} selected={selectedDay} onSelect={setSelectedDay} markedDays={weekMeetups.map((m) => new Date(m.startsAt))} />
          {meetupsQuery.isPending ? (
            <LoadingState rows={2} />
          ) : meetupsQuery.isError ? (
            <ErrorState onRetry={() => void meetupsQuery.refetch()} />
          ) : (
            <div className="px-3">
              {agenda.length > 0 ? (
                agenda.map((m) => <MeetupRow key={m.id} meetup={m} />)
              ) : (
                <EmptyState
                  title={t(dayMeetups.length > 0 ? 'home.onlyWaitingOnDay' : 'home.noMeetupOnDay', {
                    day: formatDayLabel(selectedDay, now),
                  })}
                />
              )}
            </div>
          )}
        </div>
      </section>

      <HomeActions />

      <KeepPlaying />

      {homeQuery.isError && <ErrorState onRetry={() => void homeQuery.refetch()} />}
    </div>
  )
}
