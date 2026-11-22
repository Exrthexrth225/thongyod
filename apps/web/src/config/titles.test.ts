import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/locales/en'
import { th } from '@/i18n/locales/th'
import { HARSH_TITLES, isTitleKey, TITLE_KEYS } from './titles'

describe('title catalog', () => {
  it('every title explains how it is earned, in Thai and English', () => {
    for (const key of TITLE_KEYS) {
      expect(th.titles.catalog[key], key).toBeTruthy()
      expect(en.titles.catalog[key], key).toBeTruthy()
    }
  })
  it('knows its keys', () => {
    expect(isTitleKey('payer')).toBe(true)
    expect(isTitleKey('nope')).toBe(false)
    expect(isTitleKey(null)).toBe(false)
    for (const k of HARSH_TITLES) expect(TITLE_KEYS).toContain(k)
  })
})
