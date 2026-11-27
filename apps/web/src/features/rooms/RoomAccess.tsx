import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LogOut } from 'lucide-react'
import { guestReturnTo, useCreateRoomGuest, useLogout, useRoomIdentity } from '@/api/auth'
import { checkDisplayName, NAME_MAX } from '@/features/profile/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingState } from '@/components/common/LoadingState'

export function LogoutButton() {
  const { t } = useTranslation()
  const logout = useLogout()
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>
        <LogOut aria-hidden="true" />{t(logout.isPending ? 'guestAuth.loggingOut' : 'guestAuth.logout')}
      </Button>
      {logout.isError && <p role="alert" className="text-sm text-destructive">{t('guestAuth.logoutFailed')}</p>}
    </div>
  )
}

export function GuestEntry({ returnTo = '/games/rooms' }: { returnTo?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const guest = useCreateRoomGuest()
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const invalid = checkDisplayName(name) !== null
  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (invalid) return
    try {
      await guest.mutateAsync(name.trim())
      void navigate(guestReturnTo(returnTo), { replace: true })
    } catch { /* The mutation renders its error without losing the nickname. */ }
  }
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate aria-busy={guest.isPending}>
      <label htmlFor="guest-name" className="font-medium">{t('guestAuth.name')}</label>
      <Input id="guest-name" autoComplete="nickname" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} disabled={guest.isPending} aria-invalid={submitted && invalid} aria-describedby="guest-name-help" />
      <p id="guest-name-help" className={submitted && invalid ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{t('guestAuth.hint')}</p>
      {guest.isError && <p role="alert" className="text-sm text-destructive">{t('guestAuth.failed')}</p>}
      <Button size="lg" type="submit" disabled={guest.isPending}>{t(guest.isPending ? 'guestAuth.entering' : 'guestAuth.play')}</Button>
      <p className="text-sm text-muted-foreground">{t('guestAuth.scope')}</p>
    </form>
  )
}

/** Protected room queries mount only after an account/guest identity exists. */
export function RoomAccess({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  const identity = useRoomIdentity()
  if (identity.isPending) return <LoadingState rows={2} />
  if (identity.isError) return <ErrorState onRetry={() => void identity.refetch()} />
  if (identity.data.kind === 'anonymous') return (
    <section className="mx-auto flex max-w-md flex-col gap-5 px-6 py-8">
      <h1 className="font-heading text-2xl font-semibold">{t('guestAuth.title')}</h1>
      <GuestEntry returnTo={location.pathname + location.search} />
      <Link className="min-h-11 py-3 text-center underline underline-offset-4" to={'/login?returnTo=' + encodeURIComponent(location.pathname + location.search)}>{t('auth.withLine')}</Link>
    </section>
  )
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm">{identity.data.kind === 'guest' ? t('guestAuth.playingAs', { name: identity.data.displayName }) : identity.data.displayName}</p>
        <LogoutButton />
      </div>
      {children}
    </>
  )
}
