import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getMyPet } from '@/features/onboarding/storage'
import { GREW_EVENT, type Stage } from '@/features/pet/growth'
import { confettiBurst } from '@/lib/confetti'
import { toastManager } from '@/lib/toast'

// "มังกรน้อยโตเป็นวัยรุ่นแล้ว!" when the pet reaches a new stage (#105): a toast and confetti, wherever you are.
export function PetGrowthToast() {
  const { t } = useTranslation()
  useEffect(() => {
    const onGrew = (e: Event) => {
      const stage = (e as CustomEvent<Stage>).detail
      const pet = getMyPet()
      if (!pet || stage === 'baby') return
      toastManager.add({ title: t(`pet.grew.${stage}`, { name: t(`pet.species.${pet.species}`) }), description: t('pet.grew.hint') })
      confettiBurst(window.innerWidth / 2, window.innerHeight / 3, 40)
    }
    window.addEventListener(GREW_EVENT, onGrew)
    return () => window.removeEventListener(GREW_EVENT, onGrew)
  }, [t])
  return null
}
