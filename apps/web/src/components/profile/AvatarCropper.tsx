import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { clampCrop, MAX_ZOOM, MIN_ZOOM, OUTPUT_SIZE, outputRect, shownSize, type Crop } from '@/features/profile/crop'

/** Side of the crop square on screen (px). */
const STAGE = 272

type AvatarCropperProps = {
  /** The picked photo; null = closed. */
  file: File | null
  busy?: boolean
  onCancel: () => void
  onDone: (picture: Blob) => void
  onLoadError: () => void
}

// Square crop for a profile picture (#116): drag to move, pinch or the slider to zoom. The circle shows what the
// avatar will look like; the saved picture is the whole square (512 px JPEG), so nothing is lost if shapes change.
export function AvatarCropper({ file, busy, onCancel, onDone, onLoadError }: AvatarCropperProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent title={t('profile.photo.cropTitle')} description={t('profile.photo.cropHint')}>
        {file && <CropStage key={file.name + file.size + file.lastModified} file={file} busy={busy} onCancel={onCancel} onDone={onDone} onLoadError={onLoadError} />}
      </DialogContent>
    </Dialog>
  )
}

function CropStage({ file, busy, onCancel, onDone, onLoadError }: Omit<AvatarCropperProps, 'file'> & { file: File }) {
  const { t } = useTranslation()
  const img = useRef<HTMLImageElement>(null)
  const [url] = useState(() => URL.createObjectURL(file))
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const update = (next: Crop) => natural && setCrop(clampCrop(natural, STAGE, next))
  const distance = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function onDown(e: PointerEvent) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events in tests */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) pinch.current = { dist: distance(), zoom: crop.zoom }
  }
  function onMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) update({ ...crop, zoom: pinch.current.zoom * (distance() / Math.max(1, pinch.current.dist)) })
    else if (pointers.current.size === 1) update({ ...crop, x: crop.x + e.clientX - prev.x, y: crop.y + e.clientY - prev.y })
  }
  function onUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  function save() {
    if (!natural || !img.current) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return onLoadError()
    const r = outputRect(natural, STAGE, crop)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img.current, r.x, r.y, r.w, r.h)
    // JPEG: every browser can encode it (Safari cannot make WebP from a canvas).
    canvas.toBlob((blob) => (blob ? onDone(blob) : onLoadError()), 'image/jpeg', 0.9)
  }

  const shown = natural ? shownSize(natural, STAGE, crop.zoom) : null
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative touch-none overflow-hidden rounded-3xl bg-muted select-none"
        style={{ width: STAGE, height: STAGE }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <img
          ref={img}
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={onLoadError}
          className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
          style={shown ? { width: shown.w, height: shown.h, transform: `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px)` } : { opacity: 0 }}
        />
        {/* The avatar circle; corners dimmed. */}
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_200px_rgb(0_0_0/0.45)] ring-2 ring-white/90" />
      </div>
      <label className="flex w-full items-center gap-3 text-sm">
        <span className="shrink-0 text-muted-foreground">{t('profile.photo.zoom')}</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => update({ ...crop, zoom: Number(e.target.value) })}
          className="w-full accent-[var(--brand)]"
        />
      </label>
      <div className="flex w-full gap-2">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button size="lg" className="flex-1" onClick={save} disabled={!natural || busy}>
          {t('profile.photo.use')}
        </Button>
      </div>
    </div>
  )
}
