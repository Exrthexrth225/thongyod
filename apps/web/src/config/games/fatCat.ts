// แมวอ้วง (#123): the drinking-circle card game (rules after Ohana / King's Cup, written by us). Content is Thai only,
// like the party cards. A rule set = what each card means + who it hits; groups copy the standard set and edit it.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export type Rank = (typeof RANKS)[number]

export const SUITS = ['spade', 'heart', 'diamond', 'club'] as const
export type Suit = (typeof SUITS)[number]

/**
 * Who a card hits, so the app can name them (and count them):
 * self = who opened it, pick = they choose `picks` people, left / right = the seat next to them, all = everyone,
 * none = nobody (a break), and the cards the app keeps track of: duel (7, loser wears the scarf), queen (Q),
 * king (K, sets the circle rule), game (9, play a quick game, loser is hit).
 */
export const WHO = ['self', 'pick', 'left', 'right', 'all', 'none', 'duel', 'queen', 'king', 'game'] as const
export type Who = (typeof WHO)[number]

export type Rule = { title: string; text: string; who: Who; picks?: number }

export type RuleSet = {
  id: string
  name: string
  /** What "โดน" means in this circle, e.g. "ดื่ม 1 อึก". */
  penalty: string
  /** The rule for the whole game (shown all the time). */
  always: string
  rules: Record<Rank, Rule>
}

export const MAX_PICKS = 3

export const STANDARD_SET: RuleSet = {
  id: 'standard',
  name: 'มาตรฐาน',
  penalty: 'ดื่ม 1 อึก',
  always: 'กำมือเป็นอุ้งเท้าแมวไว้ ห้ามชี้นิ้ว ห้ามปรบมือ ใครเผลอโดน',
  rules: {
    A: { title: 'โดนเอง', text: 'คนเปิดโดนคนเดียว', who: 'self' },
    '2': { title: 'แจก 1', text: 'เลือกเพื่อน 1 คนให้โดน', who: 'pick', picks: 1 },
    '3': { title: 'แจก 2', text: 'เลือกเพื่อน 2 คนให้โดน', who: 'pick', picks: 2 },
    '4': { title: 'ซ้ายโดน', text: 'คนที่นั่งทางซ้ายโดน', who: 'left' },
    '5': { title: 'โดนทั้งวง', text: 'ทุกคนโดนพร้อมกัน', who: 'all' },
    '6': { title: 'ขวาโดน', text: 'คนที่นั่งทางขวาโดน', who: 'right' },
    '7': {
      title: 'ดวลพลังปอด',
      text: 'คนเปิดท้าเพื่อน 1 คน ลากเสียงยาวพร้อมกัน เสียงใครหมดก่อนแพ้ ใส่ผ้าพันคอ ได้ 7 อีกเมื่อไหร่ คนแพ้ใหม่เป็นบัดดี้กับคนแพ้เก่า บัดดี้โดนด้วยกันเสมอ',
      who: 'duel',
    },
    '8': { title: 'พักผ่อน', text: 'รอดรอบนี้ ไม่มีใครโดน', who: 'none' },
    '9': { title: 'มินิเกม', text: 'เล่นเกมสั้นๆ 1 ตา คนแพ้โดน', who: 'game' },
    '10': { title: 'ทาแป้ง', text: 'เลือกเพื่อน 1 คน โดนทาแป้งที่หน้า', who: 'pick', picks: 1 },
    J: { title: 'แตะหน้า', text: 'ทุกคนรีบเอามือแตะหน้าตัวเอง ใครช้าสุดโดน', who: 'pick', picks: 1 },
    Q: { title: 'ควีน', text: 'คนเปิดเป็นควีน ห้ามใครคุยกับควีน ใครเผลอคุยหรือตอบคำถามควีนโดน จนกว่าจะมีควีนคนใหม่', who: 'queen' },
    K: { title: 'กฎของคิง', text: 'ทำตามกฎคิงที่ตั้งไว้ แล้วคนเปิดตั้งกฎคิงใหม่ให้รอบต่อไปได้', who: 'king' },
  },
}

/** Quick games for the 9 (they open the game; the circle comes back here after). */
export const MINI_GAMES = [
  { id: 'finger', to: '/games/finger' },
  { id: 'wheel', to: '/wheel' },
  { id: 'race', to: '/games/race' },
  { id: 'dice', to: '/games/dice' },
] as const
