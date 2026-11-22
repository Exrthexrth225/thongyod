import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './pet-room.css'

export type RoomScene = 'living' | 'bath' | 'garden'

/** Earth's drawn scenes (image/32–34) go here; missing ones use the CSS stand-ins in pet-room.css. */
const SCENE_ART: Partial<Record<RoomScene, string>> = {}

type PetRoomProps = {
  scene: RoomScene
  night?: boolean
  /** Speech bubble text over the pet (what it wants). */
  say?: string | null
  className?: string
  children: ReactNode
}

// The pet's room (#119): a scene behind the pet, darker at night, with a speech bubble for what it wants.
export function PetRoom({ scene, night, say, className, children }: PetRoomProps) {
  const art = SCENE_ART[scene]
  return (
    <div className={cn('pet-room rounded-[32px]', className)}>
      <div className={cn('pet-room-bg', !art && `is-${scene}`)} style={art ? { backgroundImage: `url(${art})` } : undefined} aria-hidden="true" />
      {children}
      {night && <div className="pet-room-night" aria-hidden="true" />}
      {say && (
        <p key={say} className="pet-say absolute top-4 left-1/2 z-[4] max-w-[80%] -translate-x-1/2 rounded-2xl bg-card px-3 py-1.5 text-center text-sm font-semibold text-foreground shadow-sm" aria-live="polite">
          {say}
        </p>
      )}
    </div>
  )
}
