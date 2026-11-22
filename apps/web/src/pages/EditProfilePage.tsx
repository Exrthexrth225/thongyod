import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'
import { useMe, useSetPhoto, useUpdateMe } from '@/api/profile'
import type { Me } from '@/api/types'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'
import { PageHeader } from '@/components/layout/PageHeader'
import { AvatarEditor, type PhotoDraft } from '@/components/profile/AvatarEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BIO_MAX, charCount, checkDisplayName, NAME_MAX, NAME_MIN } from '@/features/profile/validation'
import { showErrorToast, toastManager } from '@/lib/toast'

// /me/edit — profile picture, app name and short bio.
export function EditProfilePage() {
  const { t } = useTranslation()
  const me = useMe()

  return (
    <div className="flex flex-col gap-3 pb-6">
      <PageHeader title={t('profile.edit')} backTo="/me" />
      {me.isPending ? (
        <LoadingState rows={2} />
      ) : me.isError ? (
        <ErrorState onRetry={() => void me.refetch()} />
      ) : (
        <EditForm me={me.data} />
      )}
    </div>
  )
}

function EditForm({ me }: { me: Me }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const update = useUpdateMe()
  const setPhoto = useSetPhoto('avatar')
  const [photo, setPhotoDraft] = useState<PhotoDraft>({ kind: 'keep' })
  const [name, setName] = useState(me.displayName)
  const [bio, setBio] = useState(me.bio ?? '')
  const [serverNameError, setServerNameError] = useState<string | null>(null)

  const nameProblem = checkDisplayName(name)
  const nameError =
    serverNameError ??
    (nameProblem === 'too_short' || nameProblem === 'too_long'
      ? t('profile.errors.nameLength', { min: NAME_MIN, max: NAME_MAX })
      : nameProblem === 'bad_chars'
        ? t('profile.errors.nameChars')
        : null)
  const bioTooLong = charCount(bio.trim()) > BIO_MAX
  const textChanged = name.trim() !== me.displayName || bio.trim() !== (me.bio ?? '')
  const changed = textChanged || photo.kind !== 'keep'
  const saving = update.isPending || setPhoto.isPending

  // บันทึก saves everything on the page: the picture first (#116), then name and bio.
  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (nameError || bioTooLong || !changed || saving) return
    try {
      if (photo.kind !== 'keep') {
        await setPhoto.mutateAsync(photo.kind === 'new' ? photo.picture : null)
        setPhotoDraft({ kind: 'keep' })
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null
      return showErrorToast(t(code === 'FILE_TOO_LARGE' ? 'profile.photo.tooBig' : code === 'UNSUPPORTED_IMAGE' ? 'profile.photo.unsupported' : 'common.saveError'))
    }
    try {
      if (textChanged) await update.mutateAsync({ displayName: name.trim(), bio: bio.trim() === '' ? null : bio.trim() })
      toastManager.add({ title: t('profile.saved') })
      void navigate('/me')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DISPLAY_NAME_TAKEN') setServerNameError(t('profile.errors.nameTaken'))
      else if (error instanceof ApiError && error.code === 'INVALID_DISPLAY_NAME') setServerNameError(t('profile.errors.nameChars'))
      else showErrorToast(t('common.saveError'))
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4 px-4" noValidate>
      <AvatarEditor me={me} value={photo} onChange={setPhotoDraft} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('profile.name')}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setServerNameError(null)
          }}
          aria-invalid={nameError ? true : undefined}
          aria-describedby="name-hint"
          autoComplete="nickname"
        />
        <span id="name-hint" className={nameError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {nameError ?? t('profile.nameHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('profile.bio')}</span>
        <Input
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t('profile.bioPlaceholder')}
          aria-invalid={bioTooLong ? true : undefined}
          aria-describedby="bio-count"
        />
        <span id="bio-count" className={bioTooLong ? 'text-xs text-destructive' : 'text-right text-xs text-muted-foreground'}>
          {charCount(bio.trim())}/{BIO_MAX}
        </span>
      </label>

      <Button type="submit" size="lg" disabled={!changed || !!nameError || bioTooLong || saving}>
        {t('profile.save')}
      </Button>
    </form>
  )
}
