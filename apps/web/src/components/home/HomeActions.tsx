import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SectionHeader } from '@/components/common/SectionHeader'
import { StartMeetupCard } from '@/components/meetup/StartMeetupCard'
import { TOOLS, type ToolId } from '@/config/tools'

const SMALL: ToolId[] = ['splitBill', 'randomRestaurant', 'quickVote']

// "ทำเลย" (#132): the main action (ชวนนัด) as one big yolk card, then the three tools friends use most.
export function HomeActions() {
  const { t } = useTranslation()
  const small = SMALL.map((id) => TOOLS.find((tool) => tool.id === id)!)
  return (
    <section>
      <SectionHeader title={t('home.doNow')} />
      <div className="flex flex-col gap-2.5 px-4">
        <StartMeetupCard />
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
