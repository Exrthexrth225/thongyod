import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CalendarHeart, Gamepad2, PawPrint } from 'lucide-react'
import { Egg, type EggStyle } from '@/components/pet/Egg'
import { Pet } from '@/components/pet/Pet'
import type { PetSpeciesId } from '@/components/pet/species'
import { Button } from '@/components/ui/button'
import { GAMES, isPlayable } from '@/config/games'
import { finishOnboarding, getMyPet, saveMyPet } from '@/features/onboarding/storage'
import { secureRandomInt } from '@/lib/random'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'

// First launch (DECISIONS #46/#47, #95): what you can do here → hatch your pet. The swipe is taught on the first
// real invite deck (hint, #94) and the theme lives in Settings, so a new user is in the app in two screens.
const STEPS = 2
const EGGS: { style: EggStyle; species: PetSpeciesId | null }[] = [
  { style: 'fire', species: 'dragon' },
  { style: 'sleepy', species: 'fish' },
  { style: 'mystery', species: null },
]
const ALL_SPECIES: PetSpeciesId[] = ['dragon', 'fish']

export function WelcomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // /welcome?step=egg opens the egg screen directly (from the pet tab when no pet hatched yet).
  const [step, setStep] = useState(params.get('step') === 'egg' ? STEPS - 1 : 0)

  function done() {
    finishOnboarding()
    void navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col px-4 pt-4 pb-6">
      <div className="flex h-11 items-center justify-between">
        <div className="flex gap-1.5" aria-label={t('welcome.progress', { step: step + 1, total: STEPS })} role="img">
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={cn('h-2 rounded-full transition-all', i === step ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30')} />
          ))}
        </div>
        {step < STEPS - 1 ? (
          <Button variant="ghost" size="sm" onClick={() => setStep(STEPS - 1)}>
            {t('welcome.skip')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={done}>
            {t('welcome.later')}
          </Button>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-6">
        {step === 0 && <Intro onNext={() => setStep(1)} />}
        {step === 1 && <Hatch onDone={done} />}
      </div>
    </div>
  )
}

const POINTS = [
  { key: 'games', icon: Gamepad2, tint: 2 },
  { key: 'meet', icon: CalendarHeart, tint: 1 },
  { key: 'pet', icon: PawPrint, tint: 5 },
] as const

function Intro({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation()
  const games = GAMES.filter(isPlayable).length
  return (
    <>
      <div className="flex items-end justify-center gap-2">
        <Pet species="dragon" size={140} />
        <Pet species="fish" size={115} />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-medium">{t('welcome.introTitle')}</h1>
        <p className="mt-1 text-balance text-muted-foreground">{t('welcome.introText')}</p>
      </div>
      <ul className="grid gap-3">
        {POINTS.map((point) => (
          <li key={point.key} className="flex items-center gap-3">
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', tintClass(point.tint))}>
              <point.icon className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{t(`welcome.points.${point.key}.title`)}</span>
              <span className="block text-sm text-pretty text-muted-foreground">{t(`welcome.points.${point.key}.text`, { count: games })}</span>
            </span>
          </li>
        ))}
      </ul>
      <Button size="lg" onClick={onNext}>
        {t('welcome.start')}
      </Button>
    </>
  )
}

/** Choose 1 of 3 eggs → wobble → crack → meet your pet (DECISIONS #47). */
function Hatch({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  // The main pet is permanent: replaying the intro shows it again instead of a new egg.
  // ?again=1 (pet tab test panel, #119): hatch a new egg even when a pet exists (it replaces it).
  const [params] = useSearchParams()
  const [existing] = useState(() => (params.get('again') === '1' ? null : (getMyPet()?.species ?? null)))
  const [picked, setPicked] = useState<number | null>(null)
  const [phase, setPhase] = useState<'choose' | 'wobble' | 'cracked' | 'split' | 'born'>(existing ? 'born' : 'choose')
  const [species, setSpecies] = useState<PetSpeciesId | null>(existing)

  function pick(index: number) {
    if (phase !== 'choose') return
    const egg = EGGS[index]
    const result = egg.species ?? ALL_SPECIES[secureRandomInt(ALL_SPECIES.length)]
    setPicked(index)
    setSpecies(result)
    saveMyPet(result)
    setPhase('wobble')
    window.setTimeout(() => setPhase('cracked'), 900)
    window.setTimeout(() => setPhase('split'), 1600)
    window.setTimeout(() => setPhase('born'), 2150)
  }

  if (phase === 'born' && species) {
    return (
      <>
        <div className="pet-hatch flex justify-center">
          <Pet species={species} size={330} />
        </div>
        <div className="text-center" role="status">
          <h1 className="text-2xl font-medium">{t(existing ? 'welcome.yourPet' : 'welcome.bornTitle', { name: t(`pet.species.${species}`) })}</h1>
          <p className="mt-2 text-muted-foreground">{t(`welcome.bornText.${species}`)}</p>
        </div>
        <Button size="lg" onClick={onDone}>
          {t('welcome.finish')}
        </Button>
      </>
    )
  }

  return (
    <>
      <div className="text-center">
        <h1 className="text-2xl font-medium">{t('welcome.eggTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('welcome.eggText')}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {EGGS.map((egg, i) => (
          <button
            key={egg.style}
            type="button"
            onClick={() => pick(i)}
            disabled={phase !== 'choose' && picked !== i}
            className={cn('flex flex-col items-center gap-2 rounded-2xl p-2 transition-opacity active:scale-95', picked !== null && picked !== i && 'opacity-30')}
          >
            <Egg style={egg.style} state={picked === i && phase !== 'choose' && phase !== 'born' ? phase : 'idle'} className="h-28" />
            <span className="text-sm font-medium">{t(`welcome.eggs.${egg.style}`)}</span>
          </button>
        ))}
      </div>
    </>
  )
}
