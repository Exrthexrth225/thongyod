import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { TOOLS } from '@/config/tools'

// The big yolk "ชวนนัด" card (#132): the app's main action, on Home and at the top of the นัด tab.
export function StartMeetupCard() {
  const { t } = useTranslation()
  const invite = TOOLS.find((tool) => tool.id === 'createMeetup')!
  return (
    <Link to={invite.to!} className="pressable flex items-center gap-3.5 rounded-3xl bg-primary px-4 py-3 text-primary-foreground">
      <img src={invite.art} alt="" className="size-[52px] shrink-0" draggable={false} />
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-lg font-bold">{t('tools.createMeetup.title')}</span>
        <span className="block text-sm">{t('tools.createMeetup.desc')}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
    </Link>
  )
}
