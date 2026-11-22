import candyArt from '@/assets/party/candy.webp'
import cookieArt from '@/assets/party/cookie.webp'
import donutArt from '@/assets/party/donut.webp'
import thongyodArt from '@/assets/party/thongyod.webp'
import type { Needs } from '@/features/pet/needs'

// Pet food menu (#119): price in coins and what it fills. Art from Earth's party sheet (image/29) until the
// pet-items sheet (image/35) adds apple, onigiri, moo ping, milk, ice cream and cake.
export type PetFood = { id: 'thongyod' | 'candy' | 'cookie' | 'donut'; price: number; add: Partial<Needs>; art: string }

export const PET_FOODS: PetFood[] = [
  { id: 'cookie', price: 6, add: { food: 20 }, art: cookieArt },
  { id: 'thongyod', price: 8, add: { food: 25, fun: 10 }, art: thongyodArt },
  { id: 'donut', price: 12, add: { food: 35, fun: 5 }, art: donutArt },
  { id: 'candy', price: 4, add: { food: 8, fun: 12 }, art: candyArt },
]
