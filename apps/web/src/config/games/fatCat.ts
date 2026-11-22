// แมวอ้วง (#123, reworked #126): the drinking-circle card game (rules after Ohana / King's Cup, written by us). The app
// only draws cards and says what each one means; the circle sorts out who drinks. Content is Thai only, like the
// party cards. A rule set = what each card means; groups copy the standard set and edit it (also mid-game).

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export type Rank = (typeof RANKS)[number]

export const SUITS = ['spade', 'heart', 'diamond', 'club'] as const
export type Suit = (typeof SUITS)[number]

export type Rule = { title: string; text: string }

export type RuleSet = {
  id: string
  name: string
  /** The rule for the whole game (shown all the time). */
  always: string
  rules: Record<Rank, Rule>
}

/** Cards that buzz harder when they come up (Earth's spec): everyone drinks, and the king makes a rule. */
export const BIG_CARDS: readonly Rank[] = ['5', 'K']

export const STANDARD_SET: RuleSet = {
  id: 'standard',
  name: 'มาตรฐาน',
  always: 'กำมือเป็นอุ้งเท้าแมวไว้ ห้ามชี้นิ้ว ห้ามปรบมือ ใครเผลอโดน',
  rules: {
    A: { title: 'โดนเอง', text: 'คนเปิดโดนคนเดียว' },
    '2': { title: 'แจก 1', text: 'คนเปิดเลือกเพื่อน 1 คนให้โดน' },
    '3': { title: 'แจก 2', text: 'คนเปิดเลือกเพื่อน 2 คนให้โดน' },
    '4': { title: 'ซ้ายโดน', text: 'คนที่นั่งทางซ้ายของคนเปิดโดน' },
    '5': { title: 'โดนทั้งวง', text: 'ทุกคนโดนพร้อมกัน' },
    '6': { title: 'ขวาโดน', text: 'คนที่นั่งทางขวาของคนเปิดโดน' },
    '7': { title: 'ดวลพลังปอด', text: 'คนเปิดท้าเพื่อน 1 คน ลากเสียงยาวพร้อมกัน เสียงใครหมดก่อนแพ้ ใส่ผ้าพันคอ ได้ 7 อีกเมื่อไหร่ คนแพ้ใหม่เป็นบัดดี้กับคนแพ้เก่า โดนด้วยกันตลอด' },
    '8': { title: 'พักผ่อน', text: 'รอดรอบนี้ ไม่มีใครโดน' },
    '9': { title: 'มินิเกม', text: 'เล่นเกมสั้นๆ 1 ตา คนแพ้โดน' },
    '10': { title: 'ทาแป้ง', text: 'คนเปิดเลือกเพื่อน 1 คน โดนทาแป้งที่หน้า' },
    J: { title: 'แตะหน้า', text: 'ทุกคนรีบเอามือแตะหน้าตัวเอง ใครช้าสุดโดน' },
    Q: { title: 'ควีน', text: 'คนเปิดเป็นควีน ห้ามใครคุยกับควีน ใครเผลอคุยหรือตอบคำถามควีนโดน จนกว่าจะมีควีนคนใหม่' },
    K: { title: 'กฎของคิง', text: 'คนเปิดตั้งกฎใหม่ให้ทั้งวงทำตาม ใครทำผิดกฎโดน' },
  },
}

/** Quick games for the 9 (they open the game; the circle comes back here after). */
export const MINI_GAMES = [
  { id: 'finger', to: '/games/finger' },
  { id: 'wheel', to: '/wheel' },
  { id: 'race', to: '/games/race' },
  { id: 'dice', to: '/games/dice' },
] as const
