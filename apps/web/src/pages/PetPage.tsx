import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Cookie } from 'lucide-react'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { PageHeader } from '@/components/layout/PageHeader'
import { Pet, type PetAct, type PetHandle } from '@/components/pet/Pet'
import type { PetSpeciesId } from '@/components/pet/species'
import { Egg } from '@/components/pet/Egg'
import { Button, buttonVariants } from '@/components/ui/button'
import { markDone } from '@/features/daily/daily'
import { getMyPet } from '@/features/onboarding/storage'
import { SOUVENIRS, loadAway, takeAwayEvent } from '@/features/pet/away'
import { bangkokDayKey } from '@/features/fortune/logic'
import { SouvenirIcon } from '@/components/pet/SouvenirIcon'
import { SHOW_BACK } from '@/lib/nav'
import { BookHeart, ChevronRight } from 'lucide-react'

// Tab "สัตว์เลี้ยง" — pet preview while we test the first 2 species (DECISIONS #47). Full room in M5.
export function PetPage() {
  const { t } = useTranslation()
  const pet = useRef<PetHandle>(null)
  const [myPet] = useState(getMyPet)
  const [species, setSpecies] = useState<PetSpeciesId>(() => myPet?.species ?? 'dragon')
  const [away] = useState(() => (myPet ? takeAwayEvent(new Date(), bangkokDayKey(new Date())) : null))
  const [foundCount] = useState(() => loadAway().found.length)
  // Try every move without waiting (dev and the demo site, so it can be checked on a real phone).
  const demo = ['happy', 'wave', 'shy', 'love', 'play1', 'play2', 'play3', 'celebrate', 'yawn', 'sleep', 'idle'] as const satisfies readonly PetAct[]
  const showDemo = import.meta.env.DEV || import.meta.env.VITE_DEPLOY_MOCKS === 'true'

  return (
    <>
      <PageHeader title={t('pages.pet.title')} subtitle={t('pet.hint')} />
      <div className="flex flex-col items-center gap-6 px-4 pt-4">
        {!myPet && (
          // Skipped the egg on first launch: invite them to hatch one.
          <div className="flex w-full items-center gap-3 rounded-3xl bg-card p-3">
            <Egg style="mystery" className="h-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('pet.noPetTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('pet.noPetText')}</p>
            </div>
            <Link to="/welcome?step=egg" className={buttonVariants({ size: 'sm' })}>
              {t('pet.hatchNow')}
            </Link>
          </div>
        )}
        <div className="w-full">
          <SegmentedChoice<PetSpeciesId>
            label={t('pet.chooseSpecies')}
            value={species}
            onChange={setSpecies}
            options={[
              { value: 'dragon', label: t('pet.species.dragon') },
              { value: 'fish', label: t('pet.species.fish') },
            ]}
          />
        </div>
        <Pet key={species} species={species} size={343} ref={pet} onTap={() => markDone('pet')} />
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            pet.current?.run('eat')
            markDone('pet')
          }}
        >
          <Cookie data-icon="inline-start" />
          {t('pet.feed')}
        </Button>
        <p className="-mt-3 text-center text-xs text-muted-foreground">{t('pet.howToTouch')}</p>
        {myPet && (
          <Link to="/pet/album" state={SHOW_BACK} className="on-slab pressable flex w-full items-center gap-3 rounded-3xl bg-mint p-4">
            {away?.souvenir ? <SouvenirIcon id={away.souvenir} className="size-12" /> : <BookHeart className="size-8 shrink-0" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-lg font-medium">{t('pet.album.open')}</span>
              <span className="block text-[13px] text-pretty text-muted-foreground">
                {away
                  ? t(`pet.away.${away.activity}`, { name: t(`pet.species.${myPet.species}`) }) +
                    (away.souvenir ? t('pet.away.found', { item: t(`pet.souvenirs.${away.souvenir}`) }) : '')
                  : t('pet.album.count', { n: foundCount, total: SOUVENIRS.length })}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
          </Link>
        )}
        {showDemo && (
          <details className="w-full rounded-3xl bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium">{t('pet.demo.title')}</summary>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {demo.map((act) => (
                <Button key={act} variant="outline" size="sm" onClick={() => pet.current?.run(act)}>
                  {t(`pet.demo.${act}`)}
                </Button>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  )
}
