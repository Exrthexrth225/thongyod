import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkForNewVersion } from '@/lib/appVersion'

/** A page crashed: say so kindly and offer a reload (a stale build reloads on its own). Never the raw error page. */
export function RouteError() {
  const { t } = useTranslation()
  useEffect(() => { void checkForNewVersion() }, [])
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-lg font-bold">{t('common.crashTitle')}</p>
      <p className="text-sm text-muted-foreground">{t('common.crashHint')}</p>
      <Button size="lg" onClick={() => window.location.reload()}><RotateCw data-icon="inline-start" />{t('common.reload')}</Button>
    </div>
  )
}
