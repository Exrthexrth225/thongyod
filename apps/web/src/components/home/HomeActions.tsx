import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { SectionHeader } from '@/components/common/SectionHeader'
import { TOOLS, type ToolId } from '@/config/tools'

const SMALL: ToolId[] = ['splitBill', 'randomRestaurant', 'quickVote']

// "ทำเลย" (#132): the main action (ชวนนัด) as one big yolk card, then the three tools friends use most.
export function HomeActions() {
  const { t } = useTranslation()
  const invite = TOOLS.find((tool) => tool.id === 'createMeetup')!
  const small = SMALL.map((id) => TOOLS.find((tool) => tool.id === id)!)
  return (
    <section>
      <SectionHeader title={t('home.doNow')} />
      <div className="flex flex-col gap-2.5 px-4">
        <Link to={invite.to!} className="pressable flex items-center gap-3.5 rounded-3xl bg-primary px-4 py-3 text-primary-foreground">
          <img src={invite.art} alt="" className="size-[52px] shrink-0" draggable={false} />
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-lg font-bold">{t('tools.createMeetup.title')}</span>
            <span className="block text-sm">{t('tools.createMeetup.desc')}</span>
          </span>
          <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
        </Link>
        <div className="grid grid-cols-3 gap-2.5">
          {small.map((tool) => (
            <Link key={tool.id} to={tool.to!} className="pressable flex flex-col gap-1.5 rounded-[20px] bg-card p-3">
              <img src={tool.art} alt="" className="size-11" draggable={false} />
              <span className="text-sm leading-tight font-semibold">{t(`tools.${tool.id}.title`)}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
