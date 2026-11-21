import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/common/SectionHeader'

type HomeZoneProps = {
  /** Zone heading. Leave out when the zone's own blocks carry headings (วันนี้, น้อง). */
  title?: string
  /** Optional link on the right, e.g. <SeeAllLink />. */
  action?: ReactNode
  children: ReactNode
}

// One zone of Home (decision #83). Zones are told apart by their colour blocks and bold headings (#97),
// so there are no lines between them any more.
export function HomeZone({ title, action, children }: HomeZoneProps) {
  return (
    <section className="flex flex-col gap-2">
      {title && <SectionHeader title={title} action={action} />}
      {children}
    </section>
  )
}
