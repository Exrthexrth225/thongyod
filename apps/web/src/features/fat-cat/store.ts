import { STANDARD_SET, type RuleSet } from '@/config/games/fatCat'
import { localStore } from '@/lib/localStore'
import { isRuleSet, isTable, type Memento, type Table } from './logic'

// แมวอ้วง on this phone (#123, #126): the group's own rule sets (shared with the gang later, with rooms) and the game in
// progress with its undo stack, so leaving for a quick game on a 9 (or closing the app) carries on where it was.
export const setsStore = localStore<RuleSet[]>('thongyod-fatcat-sets', () => [], (r): r is RuleSet[] => Array.isArray(r) && r.every(isRuleSet))

export type Saved = { table: Table; undo: Memento[] } | null
export const tableStore = localStore<Saved>('thongyod-fatcat-table', () => null, (r): r is Saved => r === null || (!!r && typeof r === 'object' && isTable((r as { table: unknown }).table) && Array.isArray((r as { undo: unknown }).undo)))

export const allSets = (custom: readonly RuleSet[]) => [STANDARD_SET, ...custom]
export const setById = (custom: readonly RuleSet[], id: string) => allSets(custom).find((s) => s.id === id) ?? STANDARD_SET
