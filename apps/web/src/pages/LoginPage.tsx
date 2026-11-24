import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiFetch, ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/common/LoadingState'
import { checkDisplayName } from '@/features/profile/validation'

export function LoginPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo') ?? '/'
  const options = useQuery({ queryKey: ['auth', 'options'], queryFn: () => apiFetch<{ lineAvailable: boolean }>('/auth/options'), retry: false })
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">{t('auth.login')}</h1>
        <p className="text-muted-foreground">{t('auth.intro')}</p>
      </div>
      {params.has('error') && <p role="alert" className="text-destructive">{t('auth.loginFailed')}</p>}
      {options.isPending ? <LoadingState rows={1} /> : options.data?.lineAvailable ? (
        <Button size="lg" onClick={() => window.location.assign('/api/auth/line?returnTo=' + encodeURIComponent(returnTo))}>{t('auth.withLine')}</Button>
      ) : <p role="status" className="text-muted-foreground">{t('auth.unavailable')}</p>}
      <Link className="min-h-11 py-3 text-center underline underline-offset-4" to="/games">{t('auth.browse')}</Link>
    </main>
  )
}

export function SignupPage() {
  const { t } = useTranslation()
  const info = useQuery({ queryKey: ['auth', 'signup'], queryFn: () => apiFetch<{ suggestedDisplayName: string }>('/auth/signup'), retry: false })
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('auth.signup')}</h1>
      {info.isPending ? <LoadingState rows={2} /> : info.isError ? (
        <><p role="alert">{t('auth.signupExpired')}</p><Link className="py-3 underline underline-offset-4" to="/login">{t('auth.login')}</Link></>
      ) : <SignupForm suggestedName={info.data.suggestedDisplayName} />}
    </main>
  )
}

function SignupForm({ suggestedName }: { suggestedName: string }) {
  const { t } = useTranslation()
  const [name, setName] = useState(suggestedName)
  const [handle, setHandle] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const signup = useMutation({
    mutationFn: () => apiFetch<{ returnTo: string }>('/auth/signup', { method: 'POST', body: JSON.stringify({ displayName: name, handle }) }),
    onSuccess: (result) => window.location.assign(result.returnTo),
  })
  const nameInvalid = checkDisplayName(name) !== null
  const handleInvalid = !/^[a-z][a-z0-9._]{3,19}$/.test(handle.trim().toLowerCase())
  function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (!nameInvalid && !handleInvalid) signup.mutate()
  }
  const error = signup.error instanceof ApiError && signup.error.code === 'HANDLE_TAKEN' ? t('auth.handleTaken') : t('auth.saveFailed')
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-busy={signup.isPending}>
      <div className="space-y-2">
        <label className="block font-medium" htmlFor="signup-name">{t('auth.name')}</label>
        <Input id="signup-name" autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} aria-describedby="signup-name-help" aria-invalid={submitted && nameInvalid} disabled={signup.isPending} />
        <p id="signup-name-help" className={submitted && nameInvalid ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{t('auth.nameHelp')}</p>
      </div>
      <div className="space-y-2">
        <label className="block font-medium" htmlFor="signup-handle">{t('auth.handle')}</label>
        <Input id="signup-handle" autoComplete="username" autoCapitalize="none" spellCheck={false} value={handle} onChange={(event) => setHandle(event.target.value)} aria-describedby="signup-handle-help" aria-invalid={submitted && handleInvalid} disabled={signup.isPending} />
        <p id="signup-handle-help" className={submitted && handleInvalid ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{t('auth.handleHelp')}</p>
      </div>
      {signup.isError && <p role="alert" className="text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={signup.isPending}>{t(signup.isPending ? 'auth.saving' : 'auth.create')}</Button>
    </form>
  )
}
