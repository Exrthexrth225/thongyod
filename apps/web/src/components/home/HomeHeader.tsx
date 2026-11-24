import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, ScanLine } from 'lucide-react'
import { useUnreadNotifications } from '@/api/notifications'
import { CountBadge } from '@/components/common/CountBadge'
import { NotificationsSheet } from '@/components/notifications/NotificationsSheet'
import { ScanDialog } from '@/components/scan/ScanDialog'
import { formatFullDay } from '@/lib/date'

const ROUND = 'pressable relative grid size-11 place-items-center rounded-full bg-card'

// Top of Home (#132): today's date, a hello with my name, the QR scanner and the bell. Same shape as every tab's
// header (title left, round buttons right); no colour slab and no pet any more.
export function HomeHeader({ name, now }: { name: string | null; now: Date }) {
  const { t } = useTranslation()
  const unread = useUnreadNotifications()
  const [sheet, setSheet] = useState(false)
  const [scan, setScan] = useState(false)
  return (
    <header className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">{formatFullDay(now)}</p>
        <h1 className="truncate text-[30px] leading-tight font-extrabold">{name ? t('home.hello', { name }) : t('nav.home')}</h1>
      </div>
      <button type="button" onClick={() => setScan(true)} className={ROUND} aria-label={t('scan.open')}>
        <ScanLine className="size-[22px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setSheet(true)}
        className={ROUND}
        aria-label={unread > 0 ? `${t('common.notifications')} (${unread} ${t('notifications.unread')})` : t('common.notifications')}
      >
        <Bell className="size-[22px]" aria-hidden="true" />
        <CountBadge count={unread} className="top-1 right-0.5 ring-2 ring-background" />
      </button>
      <NotificationsSheet open={sheet} onOpenChange={setSheet} />
      <ScanDialog open={scan} onOpenChange={setScan} />
    </header>
  )
}
