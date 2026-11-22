import { useTranslation } from 'react-i18next'
import { Heart, Lock, Sparkles } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { bondStore, levelOf, levelProgress } from '@/features/pet/bond'
import { careLogStore, traitOf } from '@/features/pet/personality'
import { isLearned, LEARN_AFTER, trickStore, TRICK_DEFS } from '@/features/pet/tricks'
import { cn } from '@/lib/utils'

// ความสนิท + นิสัย + ท่าที่สอน (#121), in one sheet from the heart chip on the pet tab.
export function PetBondSheet({ open, onOpenChange, name }: { open: boolean; onOpenChange: (open: boolean) => void; name: string }) {
  const { t } = useTranslation()
  const bond = bondStore.use()
  const log = careLogStore.use()
  const tricks = trickStore.use()
  const lv = levelOf(bond.points)
  const trait = traitOf(log)
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('pet.bond.title', { name })}>
      <div className="flex flex-col gap-4 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="rounded-3xl bg-card p-4">
          <p className="flex items-center gap-2 font-heading text-xl font-bold">
            <Heart className="size-5 fill-current text-tangerine" aria-hidden="true" />
            {t('pet.bond.level', { n: lv })}
          </p>
          <span className="mt-2 block h-3 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-tangerine" style={{ width: `${levelProgress(bond.points) * 100}%` }} />
          </span>
          <p className="mt-2 text-xs text-muted-foreground">{t('pet.bond.how')}</p>
        </div>

        <div className="rounded-3xl bg-card p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-brand" aria-hidden="true" />
            {t('pet.trait.title')}
          </p>
          <p className="mt-1 font-heading text-lg font-bold">{trait ? t(`pet.trait.names.${trait}`) : t('pet.trait.unknown')}</p>
          <p className="text-sm text-muted-foreground">
            {trait ? t(`pet.trait.about.${trait}`) : t('pet.trait.unknownHint')} {trait && !log.settled && t('pet.trait.leaning')}
          </p>
        </div>

        <div className="rounded-3xl bg-card p-4">
          <p className="font-semibold">{t('pet.tricks.title')}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {TRICK_DEFS.map((d) => {
              const locked = lv < d.unlock
              const learned = isLearned(tricks, d.id)
              const good = Math.min(LEARN_AFTER, tricks.good[d.id] ?? 0)
              return (
                <li key={d.id} className={cn('flex items-center gap-2 text-sm', locked && 'text-muted-foreground')}>
                  {locked && <Lock className="size-3.5" aria-hidden="true" />}
                  <span className="flex-1 font-medium">{t(`pet.tricks.names.${d.id}`)}</span>
                  <span className="text-xs">
                    {locked ? t('pet.tricks.unlockAt', { n: d.unlock }) : learned ? t('pet.tricks.learned') : t('pet.tricks.progress', { n: good, total: LEARN_AFTER })}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </BottomSheet>
  )
}
