import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useFeedPreview } from '@/api/feed'
import { useTranslation } from 'react-i18next'
import { useGangList } from '@/api/gangs'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { InfiniteList } from '@/components/common/InfiniteList'
import { Badge } from '@/components/common/Badge'
import { SearchInput } from '@/components/common/SearchInput'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SeeAllLink } from '@/components/common/SeeAllLink'
import { FeedRow } from '@/components/home/FeedRow'
import { Card } from '@/components/ui/card'
import { GangAvatar } from '@/components/gang/GangAvatar'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { formatDayLabel, formatTime } from '@/lib/date'

// Sub-tab "แก๊ง" (inside GangsLayout): my gangs, paged + search (#43). Tap = gang page.
// Below (#132): "เพื่อนทำอะไรอยู่", the latest friends' updates (moved here from Home).
// Activity is server-derived; viewing this list never marks a gang read (#133).
export function GangsPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim())
  const list = useGangList(q)

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="px-4">
        <SearchInput value={query} onChange={setQuery} placeholder={t('gang.filterPlaceholder')} label={t('gang.filterLabel')} />
      </div>
      <InfiniteList
        query={list}
        getKey={(g) => g.id}
        renderItem={(g) => (
          <Link to={`/gangs/${g.id}`} className="pressable flex min-h-16 items-center gap-3 py-2.5">
            <GangAvatar id={g.id} name={g.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{g.name}</span>
              <span className="block text-[13px] text-muted-foreground">{t('gang.memberCount', { count: g.memberCount })}</span>
              <span className="block truncate text-[13px] text-muted-foreground">
                {g.nextMeetup ? t('gang.nextMeetup', { title: g.nextMeetup.title, when: `${formatDayLabel(new Date(g.nextMeetup.startsAt))} ${formatTime(new Date(g.nextMeetup.startsAt))}` }) : t('gang.noUpcoming')}
              </span>
            </span>
            {g.unreadCount > 0 && (
              <Badge tone="info">
                <span className="sr-only">{t('gang.unreadCount', { count: g.unreadCount })}</span>
                <span aria-hidden="true">{g.unreadCount > 99 ? '99+' : g.unreadCount}</span>
              </Badge>
            )}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
        empty={q === '' ? <EmptyState title={t('gang.empty')} hint={t('gang.emptyHint')} /> : <EmptyState title={t('gang.noMatch', { q })} />}
      />
      {q === '' && <FriendsActivity />}
    </div>
  )
}

function FriendsActivity() {
  const { t } = useTranslation()
  const now = useMemo(() => new Date(), [])
  const feed = useFeedPreview()
  const items = feed.data?.items ?? []
  if (feed.isSuccess && items.length === 0) return null
  return (
    <section>
      <SectionHeader title={t('gang.friendsActivity')} action={<SeeAllLink to="/updates" />} />
      {feed.isPending ? (
        <LoadingState rows={3} />
      ) : feed.isError ? (
        <ErrorState onRetry={() => void feed.refetch()} />
      ) : (
        <Card className="mx-4 px-4 py-1">
          {items.map((item) => (
            <FeedRow key={item.id} item={item} now={now} />
          ))}
        </Card>
      )}
    </section>
  )
}
