import { CheckSquare, Receipt, Utensils, type LucideIcon } from 'lucide-react'
import type { PendingKind } from '@thongyod/shared'
import billArt from '@/assets/tools/bill.webp'
import foodVoteArt from '@/assets/tools/foodVote.webp'
import timeVoteArt from '@/assets/tools/timeVote.webp'

/** Icon for each "ต้องจัดการ" item kind (Home row and /pending). */
export const PENDING_ICONS: Record<PendingKind, LucideIcon> = {
  vote_time: CheckSquare,
  vote_restaurant: Utensils,
  pay_bill: Receipt,
  confirm_payment: Receipt,
}

/** Colour block (lib/tones tint) for each kind, so the rows are told apart at a glance (#97). */
export const PENDING_TINTS: Record<PendingKind, number> = {
  vote_time: 5,
  vote_restaurant: 2,
  pay_bill: 1,
  confirm_payment: 4,
}

/** Sticker for each kind (sheet 53, #132): Home's "รอเราตอบ" box. */
export const PENDING_ART: Record<PendingKind, string> = {
  vote_time: timeVoteArt,
  vote_restaurant: foodVoteArt,
  pay_bill: billArt,
  confirm_payment: billArt,
}
