import { useTranslation } from 'react-i18next'
import { GameHeaderActions } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { SpectrumGame } from '@/features/spectrum/SpectrumGame'

// /games/spectrum — คลื่นความคิด
export function SpectrumPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('games.list.spectrum.title')} subtitle={t('games.list.spectrum.desc')} backTo="/games" action={<GameHeaderActions game="spectrum" />} />
      <SpectrumGame />
    </>
  )
}
