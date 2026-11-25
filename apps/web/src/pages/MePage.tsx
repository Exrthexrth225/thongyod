import { LogoutButton } from '@/features/rooms/RoomAccess'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pencil, QrCode, Settings } from 'lucide-react'
import { useProfile } from '@/api/profile'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { SectionHeader } from '@/components/common/SectionHeader'
import { ROUND_BUTTON, TabHeader } from '@/components/layout/TabHeader'
import { ProfileView } from '@/components/profile/ProfileView'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { gameById } from '@/config/games'
import { TOOLS } from '@/config/tools'
import { SHOW_BACK } from '@/lib/nav'

const toolArt = (id: string) => TOOLS.find((tool) => tool.id === id)?.art

/** "ของฉัน" (#132): things I keep on this phone. Fortune and lucky colour also sit on the เกม tab (to draw); here is my history. */
const MINE = [
  { key: 'flashcards', to: '/flashcards', art: toolArt('flashcards') },
  { key: 'fortune', to: '/fortune/history', art: gameById('fortune').art },
  { key: 'luckyColor', to: '/lucky-color', art: toolArt('luckyColor') },
  { key: 'restaurants', to: '/restaurants', art: toolArt('randomRestaurant') },
] as const

// Tab "ฉัน": my profile, then my own things. Settings live behind the gear (decision #36).
export function MePage() {
  const { t } = useTranslation()
  const profile = useProfile('me')

  return (
    <div className="flex flex-col gap-3">
      <TabHeader title={t('pages.me.title')}>
        <Link to="/settings" aria-label={t('settings.title')} className={ROUND_BUTTON}>
          <Settings className="size-[22px]" aria-hidden="true" />
        </Link>
      </TabHeader>
      <div className="flex justify-end px-4"><LogoutButton /></div>
      {profile.isPending ? (
        <LoadingState rows={3} />
      ) : profile.isError ? (
        <ErrorState onRetry={() => void profile.refetch()} />
      ) : (
        <ProfileView
          profile={profile.data}
          actions={
            <>
              <Link to="/me/edit" className={buttonVariants({ size: 'sm' })}>
                <Pencil aria-hidden="true" />
                {t('profile.edit')}
              </Link>
              <Link to="/friends/qr" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'bg-card' })}>
                <QrCode aria-hidden="true" />
                {t('friends.myQr')}
              </Link>
            </>
          }
        />
      )}
      <section>
        <SectionHeader title={t('me.mine')} />
        <Card className="mx-4 p-1.5">
          {MINE.map((item) => (
            <Link key={item.key} to={item.to} state={SHOW_BACK} className="pressable flex items-center gap-3 rounded-2xl p-2.5">
              {item.art && <img src={item.art} alt="" draggable={false} className="size-11 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{t(`me.items.${item.key}.title`)}</span>
                <span className="block truncate text-sm text-muted-foreground">{t(`me.items.${item.key}.desc`)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </Card>
      </section>
    </div>
  )
}
