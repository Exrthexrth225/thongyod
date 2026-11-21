import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/layout/PageHeader'
import { SouvenirIcon } from '@/components/pet/SouvenirIcon'
import { SOUVENIRS, loadAway } from '@/features/pet/away'
import { getMyPet } from '@/features/onboarding/storage'
import { formatDayCompact } from '@/lib/date'
import { cn } from '@/lib/utils'

// /pet/album — สมุดของที่ระลึก (#106): what the pet brought back while you were away. Unfound ones are "?".
export function PetAlbumPage() {
  const { t } = useTranslation()
  const [store] = useState(loadAway)
  const pet = getMyPet()
  const name = pet ? t(`pet.species.${pet.species}`) : t('home.yourPet')
  const found = new Map(store.found.map((f) => [f.id, f.day]))
  return (
    <>
      <PageHeader title={t('pet.album.title')} subtitle={t('pet.album.subtitle', { name })} backTo="/pet" />
      <div className="flex flex-col gap-3 px-4 pb-8">
        <p className="text-sm font-semibold">{t('pet.album.count', { n: found.size, total: SOUVENIRS.length })}</p>
        <ul className="grid grid-cols-3 gap-2.5">
          {SOUVENIRS.map((id) => {
            const day = found.get(id)
            return (
              <li key={id} className={cn('flex flex-col items-center gap-1.5 rounded-3xl bg-card p-3 text-center', !day && 'opacity-60')}>
                {day ? (
                  <SouvenirIcon id={id} />
                ) : (
                  <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-background font-heading text-2xl font-bold text-muted-foreground">
                    ?
                  </span>
                )}
                <span className="text-[13px] leading-snug font-semibold text-balance">{day ? t(`pet.souvenirs.${id}`) : t('pet.album.unknown')}</span>
                {day && <span className="text-[11px] text-muted-foreground">{formatDayCompact(new Date(`${day}T12:00:00+07:00`))}</span>}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
