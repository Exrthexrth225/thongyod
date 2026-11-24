import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, ScanLine } from 'lucide-react'
import { useUnreadNotifications } from '@/api/notifications'
import { CountBadge } from '@/components/common/CountBadge'
import { ROUND_BUTTON, TabHeader } from '@/components/layout/TabHeader'
import { NotificationsSheet } from '@/components/notifications/NotificationsSheet'
import { ScanDialog } from '@/components/scan/ScanDialog'
import { formatFullDay } from '@/lib/date'

// Top of Home (#132): today's date, a hello with my name, the QR scanner and the bell.
export function HomeHeader({ name, now }: { name: string | null; now: Date }) {
  const { t } = useTranslation()
  const unread = useUnreadNotifications()
  const [sheet, setSheet] = useState(false)
  const [scan, setScan] = useState(false)
  return (
    <TabHeader title={name ? t('home.hello', { name }) : t('nav.home')} overline={formatFullDay(now)}>
      <button type="button" onClick={() => setScan(true)} className={ROUND_BUTTON} aria-label={t('scan.open')}>
        <ScanLine className="size-[22px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setSheet(true)}
        className={ROUND_BUTTON}
        aria-label={unread > 0 ? `${t('common.notifications')} (${unread} ${t('notifications.unread')})` : t('common.notifications')}
      >
        <Bell className="size-[22px]" aria-hidden="true" />
        <CountBadge count={unread} className="top-1 right-0.5 ring-2 ring-background" />
      </button>
      <NotificationsSheet open={sheet} onOpenChange={setSheet} />
      <ScanDialog open={scan} onOpenChange={setScan} />
    </TabHeader>
  )
}
