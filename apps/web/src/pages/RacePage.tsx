import { useTranslation } from 'react-i18next'
import { GameHeaderActions } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { RaceGame } from '@/features/race/RaceGame'

// /games/race — สัตว์วิ่งแข่ง (#103)
export function RacePage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('games.list.race.title')} subtitle={t('games.list.race.desc')} backTo="/games" action={<GameHeaderActions game="race" />} />
      <RaceGame />
    </>
  )
}
