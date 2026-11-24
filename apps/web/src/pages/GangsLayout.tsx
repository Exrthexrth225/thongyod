import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react'
import { ROUND_BUTTON, TabHeader } from '@/components/layout/TabHeader'
import { SubTabs } from '@/components/layout/SubTabs'

// Tab "แก๊ง": header + sub-tabs แก๊ง | เพื่อน (decision #34). Each sub-tab is its own URL.
export function GangsLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <TabHeader title={t('pages.gangs.title')}>
        <Link to="/friends/qr" aria-label={t('friends.addFriend')} className={ROUND_BUTTON}>
          <UserPlus className="size-[22px]" aria-hidden="true" />
        </Link>
      </TabHeader>
      <SubTabs
        label={t('friends.tabsLabel')}
        tabs={[
          { to: '/gangs', label: t('friends.tabGangs') },
          { to: '/gangs/friends', label: t('friends.tabFriends') },
        ]}
      />
      <Outlet />
    </div>
  )
}
