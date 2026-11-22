import { describe, expect, it } from 'vitest'
import { clampCrop, MAX_ZOOM, outputRect, shownSize } from './crop'

const wide = { w: 1200, h: 800 }

describe('profile photo crop', () => {
  it('zoom 1 fits the short side to the stage', () => {
    expect(shownSize(wide, 300, 1)).toEqual({ w: 450, h: 300 })
  })
  it('never lets an edge come inside the square', () => {
    expect(clampCrop(wide, 300, { zoom: 1, x: 500, y: 40 })).toEqual({ zoom: 1, x: 75, y: 0 })
    expect(clampCrop(wide, 300, { zoom: 1, x: -500, y: -40 })).toEqual({ zoom: 1, x: -75, y: 0 })
    expect(clampCrop(wide, 300, { zoom: 9, x: 0, y: 0 }).zoom).toBe(MAX_ZOOM)
    expect(clampCrop(wide, 300, { zoom: 0.2, x: 0, y: 0 }).zoom).toBe(1)
  })
  it('the output shows exactly what the stage shows', () => {
    // Centred, zoom 1: the wide photo overhangs equally left and right.
    expect(outputRect(wide, 300, { zoom: 1, x: 0, y: 0 }, 600)).toEqual({ x: -150, y: 0, w: 900, h: 600 })
    // Dragged fully right: the photo's left edge sits on the square's left edge.
    expect(outputRect(wide, 300, { zoom: 1, x: 75, y: 0 }, 600).x).toBeCloseTo(0)
  })
})
