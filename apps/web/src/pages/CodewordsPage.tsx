import { useTranslation } from 'react-i18next'
import { GameHeaderActions } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { CodewordsGame } from '@/features/codewords/CodewordsGame'

// /games/codewords — ทีมคำใบ้
export function CodewordsPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('games.list.codewords.title')} subtitle={t('games.list.codewords.desc')} backTo="/games" action={<GameHeaderActions game="codewords" />} />
      <CodewordsGame />
    </>
  )
}
