import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { PET_SPECIES, type PetSpeciesId } from '@/components/pet/species'
import { doneToday, MISSIONS, useDaily, type MissionId } from '@/features/daily/daily'
import { SHOW_BACK } from '@/lib/nav'
import { cn } from '@/lib/utils'

const MISSION_TO: Record<MissionId, string> = { fortune: '/fortune', pet: '/pet', tool: '/plan' }

// "ภารกิจกับน้อง" (#54): a mint block with the pet, a done/total counter that pops when it changes,
// and the 3 missions as chips that link to where you do them. Done chips turn dark and draw their tick (#98).
export function DailyMissions({ petName, species }: { petName: string; species: PetSpeciesId | null }) {
  const { t } = useTranslation()
  const log = useDaily()
  const done = doneToday(log)
  const all = done.length === MISSIONS.length
  return (
    <div className="on-slab mx-4 rounded-[28px] bg-mint p-4">
      <Link to="/pet" state={SHOW_BACK} className="pressable flex items-center gap-3">
        {species && <img src={PET_SPECIES[species].poses[all ? 'celebrate' : 'eat']} alt="" className="-my-2 -ml-1 w-16 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-[17px] leading-snug font-medium text-balance">{t('home.missionsHeading', { name: petName })}</span>
          <span className="block text-[13px] text-pretty text-muted-foreground">
            {all ? t('home.missionsDone', { name: petName }) : t('home.missionsHint', { name: petName })}
          </span>
        </span>
        <span key={done.length} className="num-pop inline-block font-heading text-2xl font-bold tabular-nums">
          {done.length}/{MISSIONS.length}
        </span>
      </Link>
      <ul className="mt-3 flex flex-wrap gap-2">
        {MISSIONS.map((id) => {
          const ok = done.includes(id)
          return (
            <li key={id}>
              <Link
                to={MISSION_TO[id]}
                state={SHOW_BACK}
                className={cn(
                  'pressable inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold',
                  ok ? 'bg-ink text-ink-foreground' : 'bg-card',
                )}
              >
                {ok && <Check className="check-draw size-4" strokeWidth={3} aria-hidden="true" />}
                {t(`home.missions.${id}`, { name: petName })}
                {ok && <span className="sr-only">{t('home.missionDone')}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
