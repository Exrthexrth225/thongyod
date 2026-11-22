import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FlaskConical } from 'lucide-react'
import type { PetAct } from '@/components/pet/Pet'
import { Button } from '@/components/ui/button'
import { earnCoins } from '@/features/pet/coins'
import { setStageForTesting, STAGES, useGrowth } from '@/features/pet/growth'
import { getNeedsState, setNeedsState } from '@/features/pet/needs'
import { cn } from '@/lib/utils'

const MOVES = ['happy', 'wave', 'shy', 'love', 'play1', 'play2', 'play3', 'celebrate', 'yawn', 'sleep', 'idle'] as const satisfies readonly PetAct[]

type PetTestPanelProps = { onMove: (act: PetAct) => void; night: boolean | null; onNight: (night: boolean | null) => void }

// TEST ONLY (#119, Earth): try hatching, growing up, time passing and night on a real phone. Shown on dev and the
// demo site only; remove or hide before release (HANDOFF "Remove before release").
export function PetTestPanel({ onMove, night, onNight }: PetTestPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const growth = useGrowth()
  const hoursPass = (h: number) => {
    const s = getNeedsState()
    setNeedsState({ ...s, at: new Date(new Date(s.at).getTime() - h * 3_600_000).toISOString() })
  }
  const row = 'grid grid-cols-3 gap-2'
  return (
    <details className="w-full rounded-3xl bg-card p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4" aria-hidden="true" />
        {t('pet.test.title')}
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-xs">
        <p className="font-semibold">{t('pet.test.hatch')}</p>
        <Button variant="outline" size="sm" onClick={() => void navigate('/welcome?step=egg&again=1')}>
          {t('pet.test.hatchAgain')}
        </Button>
        <p className="font-semibold">{t('pet.test.stage')}</p>
        <div className={row}>
          {STAGES.map((stage) => (
            <Button key={stage} variant="outline" size="sm" className={cn(growth.stage === stage && 'ring-2 ring-brand')} onClick={() => setStageForTesting(stage)}>
              {t(`pet.test.stages.${stage}`)}
            </Button>
          ))}
        </div>
        <p className="font-semibold">{t('pet.test.time')}</p>
        <div className={row}>
          <Button variant="outline" size="sm" onClick={() => hoursPass(3)}>
            {t('pet.test.plusHours', { n: 3 })}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNeedsState({ food: 15, fun: 15, clean: 15, at: new Date().toISOString() })}>
            {t('pet.test.neglect')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => earnCoins(100)}>
            {t('pet.test.coins')}
          </Button>
        </div>
        <div className={row}>
          {([null, false, true] as const).map((v) => (
            <Button key={String(v)} variant="outline" size="sm" className={cn(night === v && 'ring-2 ring-brand')} onClick={() => onNight(v)}>
              {t(v === null ? 'pet.test.realTime' : v ? 'pet.test.night' : 'pet.test.day')}
            </Button>
          ))}
        </div>
        <p className="font-semibold">{t('pet.demo.title')}</p>
        <div className={row}>
          {MOVES.map((act) => (
            <Button key={act} variant="outline" size="sm" onClick={() => onMove(act)}>
              {t(`pet.demo.${act}`)}
            </Button>
          ))}
        </div>
      </div>
    </details>
  )
}
