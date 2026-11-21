import type { ReactNode } from 'react'
import { PET_SPECIES } from '@/components/pet/species'
import type { PoseId } from '@/features/pet/behavior'
import { getMyPet } from '@/features/onboarding/storage'

type EmptyStateProps = {
  title: string
  hint?: string
  action?: ReactNode
  /** Whole-page empties: your pet in this pose sits above the text (#107). Small inline empties leave it out. */
  pet?: Extract<PoseId, 'sleep' | 'shy' | 'yawn' | 'wave' | 'happy' | 'eat'>
}

// "Nothing here" message, e.g. a day without meetups. Put it inside a Card or page.
export function EmptyState({ title, hint, action, pet }: EmptyStateProps) {
  const species = pet ? (getMyPet()?.species ?? 'dragon') : null
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-5 text-center">
      {species && pet && <img src={PET_SPECIES[species].poses[pet]} alt="" className="empty-pet mb-2 w-32" draggable={false} />}
      <p className={pet ? 'font-heading text-lg font-medium text-balance' : 'text-sm text-muted-foreground'}>{title}</p>
      {hint && <p className={pet ? 'text-sm text-pretty text-muted-foreground' : 'text-xs text-muted-foreground'}>{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
