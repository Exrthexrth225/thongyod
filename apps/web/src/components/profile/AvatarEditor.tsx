import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Trash2 } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useSetPhoto } from '@/api/profile'
import type { Me } from '@/api/types'
import { Avatar } from '@/components/common/Avatar'
import { Button } from '@/components/ui/button'
import { showErrorToast, toastManager } from '@/lib/toast'
import { AvatarCropper } from './AvatarCropper'

// Profile picture on the edit page (#116): pick a photo → crop it in a square → upload. Or remove it
// (back to the coloured first letter).
export function AvatarEditor({ me }: { me: Me }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const setPhoto = useSetPhoto('avatar')

  function upload(picture: Blob) {
    setPhoto.mutate(picture, {
      onSuccess: () => {
        setFile(null)
        toastManager.add({ title: t('profile.photo.saved') })
      },
      onError: (error) => {
        const code = error instanceof ApiError ? error.code : null
        showErrorToast(t(code === 'FILE_TOO_LARGE' ? 'profile.photo.tooBig' : code === 'UNSUPPORTED_IMAGE' ? 'profile.photo.unsupported' : 'common.saveError'))
      },
    })
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} className="pressable relative rounded-full" aria-label={t(me.avatarUrl ? 'profile.photo.change' : 'profile.photo.add')}>
        <Avatar name={me.displayName} src={me.avatarUrl} className="size-24 text-3xl" />
        <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-ink text-ink-foreground ring-3 ring-background">
          <Camera className="size-4" aria-hidden="true" />
        </span>
      </button>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={setPhoto.isPending}>
          {t(me.avatarUrl ? 'profile.photo.change' : 'profile.photo.add')}
        </Button>
        {me.avatarUrl && (
          <Button
            variant="ghost"
            size="sm"
            disabled={setPhoto.isPending}
            onClick={() =>
              setPhoto.mutate(null, {
                onSuccess: () => toastManager.add({ title: t('profile.photo.removed') }),
                onError: () => showErrorToast(t('common.saveError')),
              })
            }
          >
            <Trash2 data-icon="inline-start" />
            {t('profile.photo.remove')}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null
          e.target.value = '' // picking the same photo again still opens the cropper
          if (picked && !picked.type.startsWith('image/')) return showErrorToast(t('profile.photo.unsupported'))
          setFile(picked)
        }}
      />
      <AvatarCropper
        file={file}
        busy={setPhoto.isPending}
        onCancel={() => setFile(null)}
        onDone={upload}
        onLoadError={() => {
          setFile(null)
          showErrorToast(t('profile.photo.loadError'))
        }}
      />
    </div>
  )
}
