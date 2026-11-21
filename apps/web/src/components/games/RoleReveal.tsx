import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { FlipCard } from '@/components/games/FlipCard'
import { Button } from '@/components/ui/button'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'
import './games.css'

type RoleRevealProps = {
  /** "ผู้เล่น 3" — shown above the card. */
  playerLabel: string
  open: boolean
  onOpen: () => void
  /** After looking: hide and pass on (or start). */
  onDone: () => void
  doneLabel: string
  /** Icon and tint of the closed card (the game's own). */
  icon: LucideIcon
  tint: number
  /** The secret side: role, word, hint. Fills the card; give it its own background. */
  back: ReactNode
}

// One player's secret on one phone (สายลับ, คนวงใน…): a closed card → tap to flip → read → hide and pass.
export function RoleReveal({ playerLabel, open, onOpen, onDone, doneLabel, icon: Icon, tint, back }: RoleRevealProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <p className="text-center text-sm text-muted-foreground">{playerLabel}</p>
      <FlipCard
        flipped={open}
        className="h-[min(56dvh,32rem)] w-full"
        front={
          <button type="button" onClick={onOpen} className={cn('flex size-full flex-col items-center justify-center gap-4 rounded-3xl p-6 text-center', tintClass(tint))}>
            <Icon className="game-breathe size-20" aria-hidden="true" />
            <span className="text-2xl font-medium">{t('games.reveal.tap')}</span>
            <span className="text-sm opacity-80">{t('games.reveal.hide')}</span>
          </button>
        }
        back={back}
      />
      <Button size="lg" variant={open ? 'default' : 'outline'} onClick={open ? onDone : onOpen}>
        {open ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
        {open ? doneLabel : t('games.reveal.tap')}
      </Button>
    </div>
  )
}

/** The back of a RoleReveal card: big text with a small label above and an optional line below. */
export function RoleCardBack({ icon: Icon, label, text, note, className }: { icon: LucideIcon; label: string; text: string; note?: string; className: string }) {
  return (
    <div className={cn('flex size-full flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center', className)}>
      <Icon className="size-14" aria-hidden="true" />
      <span className="text-sm opacity-80">{label}</span>
      <span className="text-4xl leading-tight font-medium">{text}</span>
      {note && <span className="mt-2 max-w-xs text-sm opacity-80">{note}</span>}
    </div>
  )
}
