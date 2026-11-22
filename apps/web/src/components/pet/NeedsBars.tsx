import { useTranslation } from 'react-i18next'
import { Droplets, Smile, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { LOW, NEED_IDS, type NeedId, type Needs } from '@/features/pet/needs'
import { cn } from '@/lib/utils'

const ICON: Record<NeedId, LucideIcon> = { food: UtensilsCrossed, fun: Smile, clean: Droplets }
const FILL: Record<NeedId, string> = { food: 'bg-tangerine', fun: 'bg-yolk', clean: 'bg-sky' }

// อิ่ม / สนุก / สะอาด (#119): three short bars; a low one pulses so it is noticed without nagging.
export function NeedsBars({ needs }: { needs: Needs }) {
  const { t } = useTranslation()
  return (
    <div className="grid w-full grid-cols-3 gap-2">
      {NEED_IDS.map((id) => {
        const Icon = ICON[id]
        const v = Math.round(needs[id])
        return (
          <div key={id} className="flex flex-col gap-1.5 rounded-2xl bg-card px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Icon className="size-3.5" aria-hidden="true" />
              {t(`pet.needs.${id}`)}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={t(`pet.needs.${id}`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
              <span className={cn('block h-full rounded-full transition-[width] duration-500', FILL[id], v < LOW && 'animate-pulse')} style={{ width: `${Math.max(4, v)}%` }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
