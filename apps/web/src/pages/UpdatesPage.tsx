import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useFeedList } from '@/api/feed'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { FeedRow } from '@/components/home/FeedRow'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { groupByDay } from '@/features/calendar/month'
import { formatDayLabel } from '@/lib/date'
import { useInfiniteScroll } from '@/lib/useInfiniteScroll'

// /updates — every "อัปเดตจากเพื่อน" item, grouped by day (newest first).
// Pages from /feed; items spanning page boundaries share one local-day section (#43, #133).
export function UpdatesPage() {
  const { t } = useTranslation()
  const now = useMemo(() => new Date(), [])
  const list = useFeedList()
  const sentinel = useInfiniteScroll(list)
  const days = useMemo(() => {
    const feed = list.data?.pages.flatMap(page => page.items) ?? []
    return [...groupByDay(feed.map((item) => ({ ...item, startsAt: item.createdAt }))).entries()]
  }, [list.data])

  return (
    <div className="flex flex-col gap-1 pb-8">
      <PageHeader title={t('home.friendsUpdates')} backTo="/gangs" />
      {list.isPending ? (
        <LoadingState rows={4} />
      ) : list.isError && !list.data ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : days.length === 0 ? (
        <EmptyState title={t('home.feedEmpty')} />
      ) : (
        days.map(([day, items]) => (
          <section key={day}>
            <SectionHeader title={formatDayLabel(new Date(items[0].createdAt), now)} />
            <Card className="mx-4 px-4 py-1">
              {items.map((item) => (
                <FeedRow key={item.id} item={item} now={now} />
              ))}
            </Card>
          </section>
        ))
      )}
      <div ref={sentinel} className="flex min-h-6 flex-col items-center gap-2 px-4 pb-4 text-xs text-muted-foreground" aria-live="polite">
        {list.isFetchingNextPage && <Skeleton className="h-14 w-full rounded-xl" aria-label={t('common.loading')} />}
        {list.isFetchNextPageError && (
          <>
            <span>{t('common.loadError')}</span>
            <Button variant="outline" size="sm" onClick={() => void list.fetchNextPage()}>{t('common.loadMore')}</Button>
          </>
        )}
        {days.length > 0 && !list.hasNextPage && <span>{t('common.endOfList')}</span>}
      </div>
    </div>
  )
}
