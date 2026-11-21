import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Circle, CircleCheck } from 'lucide-react'
import { useProfile } from '@/api/profile'
import { ListRow } from '@/components/common/ListRow'
import { HomeZone } from '@/components/home/HomeZone'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FIRST_RUN_TO, firstRunSteps, hasOpenedGame, hideFirstRun, isFirstRunHidden, showFirstRun } from '@/features/firstRun/firstRun'
import { SHOW_BACK } from '@/lib/nav'

// Top of Home for new users (#96): add a friend, try a game, join a gang. Ticks itself off; "ซ่อน" hides it for good.
export function FirstRunCard() {
  const { t } = useTranslation()
  const profile = useProfile('me')
  const [hidden, setHidden] = useState(isFirstRunHidden)
  const steps = firstRunSteps(profile.data?.stats, hasOpenedGame())
  if (!showFirstRun(steps, hidden) || !steps) return null
  const done = steps.filter((s) => s.done).length
  return (
    <HomeZone
      title={t('home.firstRun.title', { done, total: steps.length })}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="-my-2 text-muted-foreground"
          onClick={() => {
            hideFirstRun()
            setHidden(true)
          }}
        >
          {t('home.firstRun.hide')}
        </Button>
      }
    >
      <Card className="mx-4 px-4 py-1">
        {steps.map(({ step, done: ok }) => (
          <ListRow
            key={step}
            to={FIRST_RUN_TO[step]}
            linkState={SHOW_BACK}
            leading={ok ? <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" /> : <Circle className="size-5 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
            title={t(`home.firstRun.steps.${step}.title`)}
            subtitle={ok ? t('home.missionDone') : t(`home.firstRun.steps.${step}.text`)}
          />
        ))}
      </Card>
    </HomeZone>
  )
}
