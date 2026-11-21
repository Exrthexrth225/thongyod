import { useTranslation } from 'react-i18next'
import { GameHeaderActions } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { FingerChooser } from '@/features/finger/FingerChooser'

// /games/finger — วางนิ้วสุ่ม (#102)
export function FingerPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader title={t('games.list.finger.title')} subtitle={t('games.list.finger.desc')} backTo="/games" action={<GameHeaderActions game="finger" />} />
      <FingerChooser />
    </div>
  )
}
