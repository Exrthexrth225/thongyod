import type { BossCashTier, InvestorTeam } from '@/api/types'
import redImg from '@/assets/boss/red.webp'
import orangeImg from '@/assets/boss/orange.webp'
import yellowImg from '@/assets/boss/yellow.webp'
import greenImg from '@/assets/boss/green.webp'
import blueImg from '@/assets/boss/blue.webp'
import purpleImg from '@/assets/boss/purple.webp'

export const TEAM_LIST: InvestorTeam[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']

export const TEAM_META: Record<InvestorTeam, { img: string; bg: string; ring: string; dot: string; badge: string }> = {
  red: { img: redImg, bg: 'bg-rose-500/18', ring: 'ring-rose-500', dot: 'bg-rose-500', badge: 'bg-rose-500 text-white' },
  orange: { img: orangeImg, bg: 'bg-orange-500/18', ring: 'ring-orange-500', dot: 'bg-orange-500', badge: 'bg-orange-500 text-white' },
  yellow: { img: yellowImg, bg: 'bg-amber-400/25', ring: 'ring-amber-400', dot: 'bg-amber-400', badge: 'bg-amber-400 text-slate-950' },
  green: { img: greenImg, bg: 'bg-emerald-500/18', ring: 'ring-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-500 text-white' },
  blue: { img: blueImg, bg: 'bg-sky-500/18', ring: 'ring-sky-500', dot: 'bg-sky-500', badge: 'bg-sky-500 text-white' },
  purple: { img: purpleImg, bg: 'bg-violet-500/18', ring: 'ring-violet-500', dot: 'bg-violet-500', badge: 'bg-violet-500 text-white' },
}

export function formatMillions(amount: number): string {
  const m = amount / 1_000_000
  const text = Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, '')
  return `$${text}M`
}

export const CASH_STACK_COUNT: Record<BossCashTier, number> = {
  empty: 0,
  low: 1,
  mid: 2,
  high: 3,
  rich: 4,
}
