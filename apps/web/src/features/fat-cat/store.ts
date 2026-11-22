import { STANDARD_SET, type RuleSet } from '@/config/games/fatCat'
import { localStore } from '@/lib/localStore'
import { isHand, isRuleSet, type Hand } from './logic'

// แมวอ้วง on this phone (#123): the group's own rule sets (shared with the gang later, with rooms) and the game in
// progress, so leaving for a quick game on a 9 (or closing the app) carries on where it was.
export const setsStore = localStore<RuleSet[]>('thongyod-fatcat-sets', () => [], (r): r is RuleSet[] => Array.isArray(r) && r.every(isRuleSet))
export const handStore = localStore<Hand | null>('thongyod-fatcat-hand', () => null, (r): r is Hand | null => r === null || isHand(r))

export const allSets = (custom: readonly RuleSet[]) => [STANDARD_SET, ...custom]
export const setById = (custom: readonly RuleSet[], id: string) => allSets(custom).find((s) => s.id === id) ?? STANDARD_SET
