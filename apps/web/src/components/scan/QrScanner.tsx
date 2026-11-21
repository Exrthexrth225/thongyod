import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import QrScannerLib from 'qr-scanner'
import { CameraOff, ImageUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

type QrScannerProps = {
  /** Called for every QR text read. Return true to stop scanning (e.g. a valid friend link). */
  onRead: (text: string) => boolean
}

type ScanState = 'starting' | 'scanning' | 'failed'

// Live camera QR reader: reads as soon as a QR is in view, no shutter button (decision #34).
// Or pick a picture from the phone (a screenshot of a QR someone sent in LINE) and read it from there (#99).
// Library: qr-scanner (MIT). Camera works only on https or localhost.
export function QrScanner({ onRead }: QrScannerProps) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const onReadRef = useRef(onRead)
  const [state, setState] = useState<ScanState>('starting')
  const [imageMiss, setImageMiss] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onReadRef.current = onRead
  }, [onRead])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const scanner = new QrScannerLib(
      video,
      (result) => {
        if (onReadRef.current(result.data)) scanner.stop()
      },
      {
        preferredCamera: 'environment',
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
      },
    )
    scanner
      .start()
      .then(() => setState('scanning'))
      // qr-scanner reports permission denied and no camera the same way, so one message covers both.
      .catch(() => setState('failed'))
    return () => scanner.destroy()
  }, [])

  async function readImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // the same picture can be picked again
    if (!file) return
    setImageMiss(false)
    try {
      const result = await QrScannerLib.scanImage(file, {
        returnDetailedScanResult: true,
      })
      onReadRef.current(result.data)
    } catch {
      setImageMiss(true)
    }
  }

  const failed = state === 'failed'
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-3xl bg-black">
        <video ref={videoRef} className="size-full object-cover" muted playsInline aria-label={t('scan.title')} />
        {!failed && (
          // Frame guide in the middle of the camera view.
          <div aria-hidden="true" className="pointer-events-none absolute inset-10 rounded-xl border-2 border-white/80" />
        )}
        {failed && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
            <CameraOff className="size-8" aria-hidden="true" />
            <p className="text-sm font-medium">{t('friends.qr.cameraFailed')}</p>
            <p className="text-xs opacity-80">{t('friends.qr.cameraFailedHint')}</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void readImage(e)} />
      <Button variant="secondary" onClick={() => fileRef.current?.click()}>
        <ImageUp data-icon="inline-start" />
        {t('scan.fromImage')}
      </Button>
      {imageMiss && (
        <p role="alert" className="text-center text-sm text-tone-danger-foreground">
          {t('scan.noQrInImage')}
        </p>
      )}
    </div>
  )
}
