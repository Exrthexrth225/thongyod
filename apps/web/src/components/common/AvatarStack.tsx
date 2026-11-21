import { useTranslation } from 'react-i18next'
import { Avatar } from './Avatar'

type AvatarStackProps = {
  names: string[]
  /** Total number of people; shows "+N" for the ones not drawn. */
  total: number
  /** Ring between avatars = the surface colour behind them (default the card). */
  ringClass?: string
  /** Extra classes for each avatar, e.g. plain chips on a colour slab where a tint could match the slab. */
  avatarClass?: string
}

// Overlapping small avatars, e.g. who is going to a meetup.
export function AvatarStack({ names, total, ringClass = 'ring-card', avatarClass = '' }: AvatarStackProps) {
  const { t } = useTranslation()
  const extra = total - names.length
  if (total === 0) return null
  return (
    <span className="flex items-center" aria-hidden="true">
      {names.map((name, i) => (
        <Avatar key={`${name}-${i}`} name={name} className={`-ml-2 size-7 text-xs ring-2 first:ml-0 ${ringClass} ${avatarClass}`} />
      ))}
      {extra > 0 && <span className="ml-1 text-xs text-muted-foreground">{t('meetup.moreCount', { count: extra })}</span>}
    </span>
  )
}
