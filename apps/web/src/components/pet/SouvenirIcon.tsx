import { SOUVENIR_ART, SOUVENIR_ICON } from '@/config/souvenirs'
import type { SouvenirId } from '@/features/pet/away'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'

// One souvenir: Earth's sticker when there is one, otherwise its icon on its colour block.
export function SouvenirIcon({ id, className }: { id: SouvenirId; className?: string }) {
  const art = SOUVENIR_ART[id]
  if (art) return <img src={art} alt="" className={cn('size-14 object-contain', className)} draggable={false} />
  const { icon: Icon, tint } = SOUVENIR_ICON[id]
  return (
    <span aria-hidden="true" className={cn('grid size-14 place-items-center rounded-full', tintClass(tint), className)}>
      <Icon className="size-7" strokeWidth={2.2} />
    </span>
  )
}
