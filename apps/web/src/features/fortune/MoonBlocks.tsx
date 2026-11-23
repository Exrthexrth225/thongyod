import { useTranslation } from 'react-i18next'
import tossImg from '@/assets/fortune/poe-toss.webp'
import yesImg from '@/assets/fortune/poe-yes.webp'
import roundImg from '@/assets/fortune/poe-round.webp'
import flatImg from '@/assets/fortune/poe-flat.webp'
import { cn } from '@/lib/utils'
import type { Poe } from './logic'
import './fortune.css'

const ART: Record<Poe, string> = { yes: yesImg, no: roundImg, laugh: flatImg }

// The pair of moon blocks (ไม้ปวย, Earth's sheet 50): tumbling in the air while thrown, then how they landed.
export function MoonBlocks({ result, className }: { result: Poe | null; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-col items-center gap-2', className)} aria-live="polite">
      <img
        key={result ?? 'toss'}
        src={result ? ART[result] : tossImg}
        alt=""
        draggable={false}
        className={cn('size-36', result ? 'poe-land' : 'poe-toss')}
      />
      <p className="min-h-6 text-center font-heading text-lg font-bold text-balance">
        {result ? t(`fortune.poe.${result}`) : t('fortune.poe.throwing')}
      </p>
    </div>
  )
}
