import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import foodArt from '@/assets/packs/food.webp'
import campusArt from '@/assets/packs/campus.webp'
import animalsArt from '@/assets/packs/animals.webp'
import actionsArt from '@/assets/packs/actions.webp'
import jobsArt from '@/assets/packs/jobs.webp'
import cityArt from '@/assets/packs/city.webp'
import thingsArt from '@/assets/packs/things.webp'
import sportsArt from '@/assets/packs/sports.webp'
import lifeArt from '@/assets/packs/life.webp'
import brainArt from '@/assets/packs/brain.webp'
import travelArt from '@/assets/packs/travel.webp'
import onlineArt from '@/assets/packs/online.webp'
import futureArt from '@/assets/packs/future.webp'
import chaosArt from '@/assets/packs/chaos.webp'
import mixedArt from '@/assets/packs/mixed.webp'
import fantasyArt from '@/assets/packs/fantasy.webp'

/**
 * Earth's category stickers (image/30-pack-stickers.png, #118), by pack id. Packs in different games share ids
 * (food, campus …); a few map to the closest sticker. Unknown ids fall back to the pack's line icon.
 */
const PACK_ART: Record<string, string> = {
  food: foodArt,
  campus: campusArt,
  animals: animalsArt,
  actions: actionsArt,
  jobs: jobsArt,
  places: cityArt,
  city: cityArt,
  things: thingsArt,
  sports: sportsArt,
  life: lifeArt,
  brain: brainArt,
  trip: travelArt,
  travel: travelArt,
  online: onlineArt,
  future: futureArt,
  chaos: chaosArt,
  mixed: mixedArt,
  mix: mixedArt,
  easy: mixedArt,
  fun: fantasyArt,
}

// A content pack's picture on its tile: the sticker when there is one, otherwise its icon.
export function PackIcon({ id, icon: Icon, className }: { id: string; icon: LucideIcon; className?: string }) {
  const art = PACK_ART[id]
  return art ? (
    <img src={art} alt="" draggable={false} className={cn('-my-1 -ml-1 size-12 object-contain drop-shadow-sm', className)} />
  ) : (
    <Icon className={cn('size-6', className)} aria-hidden="true" />
  )
}
