import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Plus, Users, X } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGang, useMyGangs } from '@/api/gangs'
import { MAX_CIRCLE, MAX_NAME, addNames, circleStore, moveSeat } from '@/features/games/circle'
import { tintOfName, tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'

// "คนในวง" (#123): names in seat order for the circle games. Optional; typed, or pulled from one of my gangs.
// The order matters (turns, left / right), so seats are numbered and can be moved up and down.
export function CircleEditor() {
  const { t } = useTranslation()
  const names = circleStore.use()
  const [draft, setDraft] = useState('')
  const [gangs, setGangs] = useState(false)
  const add = () => {
    circleStore.set(addNames(names, [draft]))
    setDraft('')
  }
  return (
    <div className="mx-4 flex flex-col gap-3 rounded-3xl bg-card p-4">
      <div>
        <p className="font-medium">{t('games.circle.title')}</p>
        <p className="text-sm text-muted-foreground">{t('games.circle.hint')}</p>
      </div>
      {names.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {names.map((name, i) => (
            <li key={name} className="flex items-center gap-2">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums', tintClass(tintOfName(name)))}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <Button variant="ghost" size="icon" disabled={i === 0} aria-label={t('games.circle.up', { name })} onClick={() => circleStore.set(moveSeat(names, i, -1))}>
                <ChevronUp />
              </Button>
              <Button variant="ghost" size="icon" disabled={i === names.length - 1} aria-label={t('games.circle.down', { name })} onClick={() => circleStore.set(moveSeat(names, i, 1))}>
                <ChevronDown />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t('games.circle.remove', { name })} onClick={() => circleStore.set(names.filter((x) => x !== name))}>
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {names.length < MAX_CIRCLE && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX_NAME} placeholder={t('games.circle.placeholder', { n: names.length + 1 })} aria-label={t('games.circle.placeholder', { n: names.length + 1 })} enterKeyHint="done" />
          <Button type="submit" disabled={!draft.trim()} aria-label={t('games.circle.add')}>
            <Plus />
          </Button>
        </form>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setGangs(true)}>
          <Users data-icon="inline-start" />
          {t('games.circle.fromGang')}
        </Button>
        {names.length > 0 && (
          <Button variant="ghost" onClick={() => circleStore.set([])}>
            {t('games.circle.clear')}
          </Button>
        )}
      </div>
      <GangPicker open={gangs} onOpenChange={setGangs} onPick={(list) => circleStore.set(addNames(circleStore.get(), list))} />
    </div>
  )
}

function GangPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (names: string[]) => void }) {
  const { t } = useTranslation()
  const gangs = useMyGangs()
  const [chosen, setChosen] = useState('')
  const gang = useGang(chosen)
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) setChosen('')
  }
  return (
    <BottomSheet open={open} onOpenChange={close} title={chosen && gang.data ? gang.data.name : t('games.circle.fromGang')}>
      <div className="flex flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {!chosen &&
          (gangs.data?.length ? (
            gangs.data.map((g) => (
              <button key={g.id} type="button" onClick={() => setChosen(g.id)} className="pressable flex items-center gap-3 rounded-2xl bg-card p-3 text-left">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tintClass(tintOfName(g.name)))}>
                  <Users className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                <span className="text-sm text-muted-foreground">{t('games.circle.members', { n: g.memberCount })}</span>
              </button>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{gangs.isPending ? t('common.loading') : t('games.circle.noGangs')}</p>
          ))}
        {chosen && (
          <>
            <p className="text-sm text-muted-foreground">{t('games.circle.gangHint')}</p>
            <ul className="flex flex-wrap gap-1.5">
              {(gang.data?.members ?? []).map((m) => (
                <li key={m.userId} className="rounded-full bg-muted px-3 py-1 text-sm">
                  {m.displayName}
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              disabled={!gang.data}
              onClick={() => {
                onPick(gang.data!.members.map((m) => m.displayName))
                close(false)
              }}
            >
              {t('games.circle.addAll', { n: gang.data?.members.length ?? 0 })}
            </Button>
            <Button variant="ghost" onClick={() => setChosen('')}>
              {t('common.back')}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
