import { useMemo, useState } from 'react'
import { useHome } from '@/api/home'
import { useTranslation } from 'react-i18next'
import { useGangList } from '@/api/gangs'
import { EmptyState } from '@/components/common/EmptyState'
import { InfiniteList } from '@/components/common/InfiniteList'
import { ListRow } from '@/components/common/ListRow'
import { SearchInput } from '@/components/common/SearchInput'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SeeAllLink } from '@/components/common/SeeAllLink'
import { FeedRow } from '@/components/home/FeedRow'
import { Card } from '@/components/ui/card'
import { GangAvatar } from '@/components/gang/GangAvatar'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

// Sub-tab "แก๊ง" (inside GangsLayout): my gangs, paged + search (#43). Tap = gang page.
// Below (#132): "เพื่อนทำอะไรอยู่", the latest friends' updates (moved here from Home).
// Latest activity / unread dots (spec §6.1) wait for a gang activity API.
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
          <ListRow leading={<GangAvatar id={g.id} name={g.name} />} title={g.name} subtitle={t('gang.memberCount', { count: g.memberCount })} to={`/gangs/${g.id}`} />
        )}
        empty={q === '' ? <EmptyState title={t('gang.empty')} hint={t('gang.emptyHint')} /> : <EmptyState title={t('gang.noMatch', { q })} />}
      />
      {q === '' && <FriendsActivity />}
    </div>
  )
}

const FEED_SHOWN = 3

function FriendsActivity() {
  const { t } = useTranslation()
  const now = useMemo(() => new Date(), [])
  const home = useHome()
  const items = useMemo(
    () => [...(home.data?.feed ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, FEED_SHOWN),
    [home.data],
  )
  if (items.length === 0) return null
  return (
    <section>
      <SectionHeader title={t('gang.friendsActivity')} action={<SeeAllLink to="/updates" />} />
      <Card className="mx-4 px-4 py-1">
        {items.map((item) => (
          <FeedRow key={item.id} item={item} now={now} />
        ))}
      </Card>
    </section>
  )
}
