import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Trash2, Undo2 } from 'lucide-react'
import type { Me } from '@/api/types'
import { Avatar } from '@/components/common/Avatar'
import { Button } from '@/components/ui/button'
import { showErrorToast } from '@/lib/toast'
import { AvatarCropper } from './AvatarCropper'

/** What the edit form will do with the picture when you press บันทึก (#116): nothing, a new one, or remove it. */
export type PhotoDraft = { kind: 'keep' } | { kind: 'new'; picture: Blob } | { kind: 'remove' }

// Profile picture on the edit page (#116): pick a photo → crop it → it shows here as a preview. Nothing is uploaded
// until บันทึก (Earth: it changed without saving); leaving the page drops the draft.
export function AvatarEditor({ me, value, onChange }: { me: Me; value: PhotoDraft; onChange: (draft: PhotoDraft) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const preview = useMemo(() => (value.kind === 'new' ? URL.createObjectURL(value.picture) : null), [value])
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const shown = value.kind === 'new' ? preview : value.kind === 'remove' ? null : me.avatarUrl
  const hasPhoto = !!shown
  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} className="pressable relative rounded-full" aria-label={t(hasPhoto ? 'profile.photo.change' : 'profile.photo.add')}>
        <Avatar name={me.displayName} src={shown} className="size-24 text-3xl" />
        <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-ink text-ink-foreground ring-3 ring-background">
          <Camera className="size-4" aria-hidden="true" />
        </span>
      </button>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
          {t(hasPhoto ? 'profile.photo.change' : 'profile.photo.add')}
        </Button>
        {hasPhoto && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(me.avatarUrl ? { kind: 'remove' } : { kind: 'keep' })}>
            <Trash2 data-icon="inline-start" />
            {t('profile.photo.remove')}
          </Button>
        )}
        {value.kind !== 'keep' && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ kind: 'keep' })}>
            <Undo2 data-icon="inline-start" />
            {t('profile.photo.undo')}
          </Button>
        )}
      </div>
      {value.kind !== 'keep' && <p className="text-xs text-muted-foreground">{t('profile.photo.pending')}</p>}
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
        onCancel={() => setFile(null)}
        onDone={(picture) => {
          setFile(null)
          onChange({ kind: 'new', picture })
        }}
        onLoadError={() => {
          setFile(null)
          showErrorToast(t('profile.photo.loadError'))
        }}
      />
    </div>
  )
}
