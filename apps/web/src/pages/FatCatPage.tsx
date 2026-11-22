import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BetaNote, GameHeaderActions } from '@/components/games/HowToPlay'
import { PageHeader } from '@/components/layout/PageHeader'
import { STANDARD_SET } from '@/config/games/fatCat'
import { FatCatGame } from '@/features/fat-cat/FatCatGame'
import { RuleSetEditor } from '@/features/fat-cat/RuleSetEditor'
import { setsStore, tableStore } from '@/features/fat-cat/store'

// /games/fat-cat — แมวอ้วง (#123)
export function FatCatPage() {
  const { t } = useTranslation()
  // Playing: the page is exactly one screen tall, so the card can take all the height left (#126).
  const playing = tableStore.use() !== null
  return (
    <div className={playing ? 'flex h-dvh flex-col' : undefined}>
      <PageHeader title={t('games.list.fatCat.title')} subtitle={t('games.list.fatCat.desc')} backTo="/games" action={<GameHeaderActions game="fatCat" />} />
      {!playing && <BetaNote game="fatCat" />}
      <FatCatGame />
    </div>
  )
}

// /games/fat-cat/rules/:id — one rule set
export function FatCatRulesPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const custom = setsStore.use()
  const name = id === STANDARD_SET.id ? t('games.fatCat.sets.standard') : (custom.find((s) => s.id === id)?.name ?? '')
  return (
    <>
      <PageHeader title={t('games.fatCat.sets.pageTitle', { name })} backTo="/games/fat-cat" />
      <RuleSetEditor key={id} id={id} />
    </>
  )
}
