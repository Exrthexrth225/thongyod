import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react'
import type { BossView, RoomPlayer } from '@/api/types'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { M, nameOf, seatTeam, TEAM_COLOR } from './meta'
import { Face, Money } from './parts'

/** − / tap to type / + with a +5 shortcut. Whole millions. */
function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const { t } = useTranslation()
  const [typing, setTyping] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="secondary" className="size-10 rounded-full" aria-label="-1" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}><Minus /></Button>
      {typing ? (
        <input
          autoFocus
          inputMode="numeric"
          aria-label={`${label} · ${t('boss.editor.typeAmount')}`}
          className="h-10 w-16 rounded-xl border bg-background text-center text-lg font-black tabular-nums"
          defaultValue={value || ''}
          onBlur={(e) => { onChange(Math.min(999, Math.max(0, Math.floor(Number(e.target.value) || 0)))); setTyping(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      ) : (
        <button type="button" className="h-10 w-16 rounded-xl bg-muted text-lg font-black tabular-nums" aria-label={`${label} · ${t('boss.editor.typeAmount')}`} onClick={() => setTyping(true)}>{value}</button>
      )}
      <Button size="icon" variant="secondary" className="size-10 rounded-full" aria-label="+1" onClick={() => onChange(value + 1)}><Plus /></Button>
      <Button size="sm" variant="ghost" className="h-10 px-2 font-black" onClick={() => onChange(value + 5)}>+5</Button>
    </div>
  )
}

/** Boss: split the deal value. Anyone at the table can be paid; whatever is left is the boss's. */
export function OfferSheet({ open, onOpenChange, view, players, sending, onSend }: { open: boolean; onOpenChange: (v: boolean) => void; view: BossView; players: RoomPlayer[]; sending: boolean; onSend: (allocation: Record<string, number>) => void }) {
  const { t } = useTranslation()
  const deal = view.deal
  const others = view.seats.map((s) => s.userId).filter((id) => id !== deal?.bossId)
  // Start from the current offer, else from what people asked for.
  const start = () => Object.fromEntries(others.map((id) => [id, Math.round(((deal?.offered ? deal.allocation[id] : deal?.asks[id]) ?? 0) / M)]))
  const [amounts, setAmounts] = useState<Record<string, number>>(start)
  if (!deal) return null
  const total = deal.totalValue / M
  const given = Object.values(amounts).reduce((a, b) => a + b, 0)
  const left = total - given
  const contributors = new Set(deal.contributorIds)
  const ordered = [...others].sort((a, b) => Number(contributors.has(b)) - Number(contributors.has(a)))
  const send = () => onSend({ ...Object.fromEntries(Object.entries(amounts).filter(([, v]) => v > 0).map(([id, v]) => [id, v * M])), ...(left > 0 ? { [deal.bossId]: left * M } : {}) })
  return (
    <BottomSheet
      full
      open={open}
      onOpenChange={(v) => { if (v) setAmounts(start()); onOpenChange(v) }}
      title={t('boss.editor.title')}
      footer={
        <div className="flex flex-col gap-2 border-t p-3">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {ordered.map((id) => <i key={id} className="h-full transition-[width]" style={{ width: `${(Math.min(amounts[id] ?? 0, total) / total) * 100}%`, background: TEAM_COLOR[seatTeam(view, id)] }} />)}
            {left > 0 && <i className="h-full bg-amber-400" style={{ width: `${(left / total) * 100}%` }} />}
          </div>
          <div className={cn('flex items-center justify-between rounded-xl px-3 py-2 font-bold', left < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-900')}>
            <span>{left < 0 ? t('boss.deal.over') : t('boss.deal.bossKeeps')}</span>
            <Money amount={Math.abs(left) * M} className="text-xl" />
          </div>
          <Button size="lg" className="h-13 text-lg" disabled={left < 0 || sending} onClick={send}>
            {left < 0 ? t('boss.editor.reduce', { amount: t('boss.money', { m: -left }) }) : t('boss.editor.send')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-3">
        <p className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('boss.editor.hint')}</span>
          <Money amount={deal.totalValue} className="text-lg text-foreground" />
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAmounts(Object.fromEntries(others.map((id) => [id, Math.round((deal.asks[id] ?? 0) / M)])))}>{t('boss.editor.fillAsks')}</Button>
          <Button variant="ghost" size="sm" onClick={() => setAmounts(Object.fromEntries(others.map((id) => [id, 0])))}>{t('boss.editor.clear')}</Button>
        </div>
        <ul className="flex flex-col gap-2">
          {ordered.map((id) => {
            const ask = deal.asks[id]
            return (
              <li key={id} className={cn('flex items-center gap-2 rounded-2xl bg-card p-2', !contributors.has(id) && 'opacity-85')}>
                <Face team={seatTeam(view, id)} className="size-10" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate font-bold">{nameOf(players, id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {ask !== undefined && ask !== null ? t('boss.deal.asked', { amount: t('boss.money', { m: ask / M }) }) : contributors.has(id) ? '' : t('boss.deal.bribe')}
                  </p>
                </div>
                <Stepper value={amounts[id] ?? 0} onChange={(v) => setAmounts((a) => ({ ...a, [id]: v }))} label={nameOf(players, id)} />
              </li>
            )
          })}
        </ul>
      </div>
    </BottomSheet>
  )
}

/** A player: tell the boss the price you want (public, like saying it at the table). */
export function AskSheet({ open, onOpenChange, current, sending, onSend }: { open: boolean; onOpenChange: (v: boolean) => void; current: number | null; sending: boolean; onSend: (amount: number | null) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(() => Math.round((current ?? 0) / M))
  return (
    <BottomSheet full open={open} onOpenChange={(v) => { if (v) setValue(Math.round((current ?? 0) / M)); onOpenChange(v) }} title={t('boss.act.askTitle')}>
      <div className="flex flex-col items-center gap-4 px-4 pb-6">
        <Stepper value={value} onChange={setValue} label={t('boss.act.askTitle')} />
        <Money amount={value * M} className="text-4xl text-amber-600" />
        <div className="flex w-full gap-2">
          {current !== null && <Button variant="ghost" className="flex-1" disabled={sending} onClick={() => onSend(null)}>{t('boss.act.askClear')}</Button>}
          <Button className="flex-1" size="lg" disabled={sending} onClick={() => onSend(value * M)}>{t('boss.act.askSend')}</Button>
        </div>
      </div>
    </BottomSheet>
  )
}
