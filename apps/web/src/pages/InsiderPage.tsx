import { useTranslation } from 'react-i18next'
import { GameHeaderActions } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { InsiderGame } from '@/features/insider/InsiderGame'

// /games/insider — คนวงใน
export function InsiderPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('games.list.insider.title')} subtitle={t('games.list.insider.desc')} backTo="/games" action={<GameHeaderActions game="insider" />} />
      <InsiderGame />
    </>
  )
}
