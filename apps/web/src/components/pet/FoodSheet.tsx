import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { PET_FOODS, type PetFood } from '@/config/petFoods'
import { cn } from '@/lib/utils'

type FoodSheetProps = { open: boolean; onOpenChange: (open: boolean) => void; coins: number; onPick: (food: PetFood) => void }

// The food menu (#119): what each item costs and fills. Items you can't afford are dimmed but still explain why.
export function FoodSheet({ open, onOpenChange, coins, onPick }: FoodSheetProps) {
  const { t } = useTranslation()
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('pet.food.title')}
      action={
        <span className="flex items-center gap-1 rounded-full bg-yolk px-2.5 py-1 text-sm font-bold text-on-slab tabular-nums">
          <Coins className="size-4" aria-hidden="true" />
          {coins}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {PET_FOODS.map((food) => {
          const short = food.price > coins
          return (
            <button key={food.id} type="button" onClick={() => onPick(food)} className={cn('pressable flex flex-col items-center gap-1 rounded-3xl bg-card p-3 ring-1 ring-border', short && 'opacity-55')}>
              <img src={food.art} alt="" draggable={false} className="size-16 object-contain" />
              <span className="font-semibold">{t(`pet.food.items.${food.id}`)}</span>
              <span className="flex flex-wrap justify-center gap-1 text-[11px]">
                {food.add.food ? <span className="rounded-full bg-tangerine/25 px-1.5">{t('pet.food.adds.food', { n: food.add.food })}</span> : null}
                {food.add.fun ? <span className="rounded-full bg-yolk/40 px-1.5">{t('pet.food.adds.fun', { n: food.add.fun })}</span> : null}
              </span>
              <span className="mt-1 flex items-center gap-1 text-sm font-bold tabular-nums">
                <Coins className="size-3.5" aria-hidden="true" />
                {food.price}
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
