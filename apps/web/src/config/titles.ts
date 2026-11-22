// ฉายา catalog (#117, PROVISIONAL until the backend's titles work, M6). The key is the ERD's `title_key`;
// the name and "how you get it" are frontend text (i18n `titles.catalog.<key>`), so the rules can be shown and
// translated. `harsh` = a teasing title that only appears in gangs that turned on harsh titles (ERD gang setting).
export const TITLE_KEYS = [
  'payer',
  'onTime',
  'host',
  'fastPayer',
  'explorer',
  'connector',
  'quickVoter',
  'saimu',
  'bbqKing',
  'badmintonKing',
  'stoodUp',
] as const
export type TitleKey = (typeof TITLE_KEYS)[number]

export const HARSH_TITLES: ReadonlySet<TitleKey> = new Set<TitleKey>(['stoodUp'])

export const isTitleKey = (key: string | null | undefined): key is TitleKey => !!key && (TITLE_KEYS as readonly string[]).includes(key)
