// Square photo crop (profile picture, #116): the photo always covers the square; the user pans and zooms.

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
/** Side of the saved picture in px (sharp on 3x screens at the biggest avatar, still small to upload). */
export const OUTPUT_SIZE = 512

export type Crop = { zoom: number; x: number; y: number }

/** Size of the photo on a stage of side `stage` px at `zoom` (zoom 1 = the short side fits the stage). */
export function shownSize(natural: { w: number; h: number }, stage: number, zoom: number) {
  const k = (stage / Math.min(natural.w, natural.h)) * zoom
  return { w: natural.w * k, h: natural.h * k }
}

/** Keep the photo covering the whole stage: the centre offset can move at most half the overhang. */
export function clampCrop(natural: { w: number; h: number }, stage: number, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom))
  const s = shownSize(natural, stage, zoom)
  const mx = (s.w - stage) / 2
  const my = (s.h - stage) / 2
  // "+ 0" turns -0 into 0.
  return { zoom, x: Math.min(mx, Math.max(-mx, crop.x)) + 0, y: Math.min(my, Math.max(-my, crop.y)) + 0 }
}

/** Where to draw the photo on the square output canvas (same picture as the stage, scaled up). */
export function outputRect(natural: { w: number; h: number }, stage: number, crop: Crop, out = OUTPUT_SIZE) {
  const k = out / stage
  const s = shownSize(natural, stage, crop.zoom)
  return { x: (out - s.w * k) / 2 + crop.x * k, y: (out - s.h * k) / 2 + crop.y * k, w: s.w * k, h: s.h * k }
}
