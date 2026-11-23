// เกมโดเรม่อน card art (#129): Earth's sticker-style playing cards (image/48-card-faces.png, image/49-card-back.png,
// cut by tools/pet-art/grid.py). A face = big corners + the picture (J/Q/K royal, ornate ace, or the usual pip layout
// for 2–10) + what the card means. The back is the red lattice; its calm middle band carries whose turn it is.
import type { ReactNode } from 'react'
import type { Card } from './logic'
import type { Rule } from '@/config/games/fatCat'
import { cn } from '@/lib/utils'
import { backArt, isRed, pictureOf, pipArt, PIPS } from './cardImages'

/** The card is always paper white (like a real card), in light and dark mode alike. */
export function CardFace({ card, rule }: { card: Card; rule: Rule }) {
  const pip = pipArt(card.suit)
  const picture = pictureOf(card)
  const many = card.rank === '9' || card.rank === '10'
  const corner = (
    <span className="flex w-[15cqw] flex-col items-center leading-none">
      <span className="font-heading text-[13cqw] leading-[0.9] font-extrabold tracking-tight">{card.rank}</span>
      <img src={pip} alt="" className="mt-[1cqw] size-[9cqw]" draggable={false} />
    </span>
  )
  return (
    <span
      className={cn(
        'relative block size-full overflow-hidden rounded-[1.4rem] bg-white text-center shadow-lg [container-type:size]',
        isRed(card.suit) ? 'text-[#c8232c]' : 'text-[#2a1f1d]',
      )}
    >
      <span className="flex size-full flex-col items-center pt-[5cqw] pb-[25cqw]">
      <span className="absolute top-[3.5cqw] left-[3cqw]">{corner}</span>
      <span className="absolute right-[3cqw] bottom-[3.5cqw] rotate-180">{corner}</span>
      <span className="relative mx-[10cqw] min-h-[22cqh] w-[62cqw] flex-1 [container-type:size]">
        {picture ? (
          <img src={picture} alt="" draggable={false} className="absolute inset-0 m-auto size-[min(100cqw,100cqh)] object-contain" />
        ) : (
          PIPS[card.rank]!.map(([x, y], i) => (
            <img
              key={i}
              src={pip}
              alt=""
              draggable={false}
              className={cn('absolute -translate-1/2 object-contain', many ? 'size-[min(17cqh,24cqw)]' : 'size-[min(21cqh,30cqw)]', y > 0.5 && 'rotate-180')}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            />
          ))
        )}
      </span>
      <span className="mt-[3cqh] flex shrink-0 flex-col items-center gap-[1.5cqh] px-[8cqw] text-[#2a1f1d]">
        <span className="font-heading text-[clamp(24px,9.5cqw,40px)] leading-tight font-extrabold text-balance">{rule.title}</span>
        <span className="text-[clamp(14px,5cqw,19px)] leading-snug text-pretty">{rule.text}</span>
      </span>
      </span>
    </span>
  )
}

/** The back: the red lattice; whose turn it is sits in the calm band across the middle. */
export function CardBack({ children, above, below }: { children: ReactNode; above?: ReactNode; below?: ReactNode }) {
  return (
    <span className="relative block size-full overflow-hidden rounded-[1.4rem] shadow-lg [container-type:size]">
      <img src={backArt} alt="" draggable={false} className="absolute inset-0 size-full object-fill" />
      <span className="absolute inset-x-[4cqw] top-[44cqh] flex h-[12cqh] items-center justify-center gap-[2cqw] px-[3cqw] text-[#fff4dc]">
        {children}
      </span>
      {above && (
        <span className="absolute inset-x-[8cqw] bottom-[57.5cqh] text-center text-[clamp(13px,4.5cqw,17px)] font-semibold text-[#fff4dc]">
          {above}
        </span>
      )}
      {below && (
        <span className="absolute inset-x-[8cqw] top-[57.5cqh] text-center text-[clamp(13px,4.5cqw,17px)] font-semibold text-[#fff4dc]/90">
          {below}
        </span>
      )}
    </span>
  )
}
