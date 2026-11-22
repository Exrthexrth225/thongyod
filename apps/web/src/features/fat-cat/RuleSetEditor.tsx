import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Copy, Save, Trash2 } from 'lucide-react'
import { BottomAction } from '@/components/games/BottomAction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MAX_PICKS, RANKS, STANDARD_SET, WHO, type Rank, type Rule, type RuleSet, type Who } from '@/config/games/fatCat'
import { toastManager } from '@/lib/toast'
import { SHOW_BACK } from '@/lib/nav'
import { secureRandomInt } from '@/lib/random'
import { cn } from '@/lib/utils'
import { copySet } from './logic'
import { setsStore } from './store'

const field = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

// One rule set of แมวอ้วง (#123): the name, what "โดน" means, the rule for the whole game, and per card a title,
// what to do, and who it hits (so the app can name them). The standard set is read-only: copy it to change it.
export function RuleSetEditor({ id }: { id: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const custom = setsStore.use()
  const saved = id === STANDARD_SET.id ? STANDARD_SET : custom.find((s) => s.id === id)
  const [draft, setDraft] = useState<RuleSet | null>(saved ?? null)
  const [sure, setSure] = useState(false)
  const readOnly = id === STANDARD_SET.id

  if (!draft) return <p className="px-4 py-10 text-center text-muted-foreground">{t('games.fatCat.sets.missing')}</p>

  const setRule = (rank: Rank, patch: Partial<Rule>) => setDraft((d) => d && { ...d, rules: { ...d.rules, [rank]: { ...d.rules[rank], ...patch } } })
  const clean = (s: RuleSet): RuleSet => ({
    ...s,
    name: s.name.trim() || t('games.fatCat.sets.untitled'),
    penalty: s.penalty.trim() || STANDARD_SET.penalty,
    rules: Object.fromEntries(RANKS.map((r) => [r, { ...s.rules[r], title: s.rules[r].title.trim() || STANDARD_SET.rules[r].title }])) as Record<Rank, Rule>,
  })

  function save() {
    setsStore.set(custom.map((s) => (s.id === id ? clean(draft!) : s)))
    toastManager.add({ title: t('games.fatCat.sets.saved') })
    void navigate(-1)
  }
  function copy() {
    const next = `g${secureRandomInt(1_000_000_000)}`
    setsStore.set([...custom, copySet(STANDARD_SET, next, t('games.fatCat.sets.newName', { n: custom.length + 1 }))])
    void navigate(`/games/fat-cat/rules/${next}`, { replace: true, state: SHOW_BACK })
  }
  function remove() {
    if (!sure) return setSure(true)
    setsStore.set(custom.filter((s) => s.id !== id))
    void navigate(-1)
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-28">
      {readOnly ? (
        <p className="rounded-2xl bg-muted p-3 text-sm">{t('games.fatCat.sets.readOnly')}</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-3xl bg-card p-4">
          <Labeled label={t('games.fatCat.sets.name')}>
            <Input value={draft.name} maxLength={30} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Labeled>
          <Labeled label={t('games.fatCat.sets.penaltyLabel')} hint={t('games.fatCat.sets.penaltyHint')}>
            <Input value={draft.penalty} maxLength={30} onChange={(e) => setDraft({ ...draft, penalty: e.target.value })} />
          </Labeled>
          <Labeled label={t('games.fatCat.sets.always')}>
            <textarea value={draft.always} maxLength={120} rows={2} onChange={(e) => setDraft({ ...draft, always: e.target.value })} className={field} />
          </Labeled>
        </div>
      )}

      <ol className="flex flex-col gap-2">
        {RANKS.map((rank) => {
          const rule = draft.rules[rank]
          return (
            <li key={rank} className="flex gap-3 rounded-3xl bg-card p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink font-heading text-xl font-bold text-ink-foreground">{rank}</span>
              {readOnly ? (
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{rule.title}</p>
                  <p className="text-sm text-muted-foreground">{rule.text}</p>
                  <p className="mt-1 text-xs font-semibold">
                    {t(`games.fatCat.who.${rule.who}`)}
                    {rule.who === 'pick' && ` ${t('games.fatCat.sets.people', { n: rule.picks ?? 1 })}`}
                  </p>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input value={rule.title} maxLength={24} aria-label={t('games.fatCat.sets.cardTitle', { rank })} onChange={(e) => setRule(rank, { title: e.target.value })} />
                  <textarea value={rule.text} maxLength={200} rows={2} aria-label={t('games.fatCat.sets.cardText', { rank })} onChange={(e) => setRule(rank, { text: e.target.value })} className={field} />
                  <div className="flex gap-2">
                    <select value={rule.who} aria-label={t('games.fatCat.sets.cardWho', { rank })} onChange={(e) => setRule(rank, { who: e.target.value as Who })} className={cn(field, 'h-11 flex-1')}>
                      {WHO.map((w) => (
                        <option key={w} value={w}>
                          {t(`games.fatCat.who.${w}`)}
                        </option>
                      ))}
                    </select>
                    {rule.who === 'pick' && (
                      <select value={rule.picks ?? 1} aria-label={t('games.fatCat.sets.picks', { rank })} onChange={(e) => setRule(rank, { picks: Number(e.target.value) })} className={cn(field, 'h-11 w-24')}>
                        {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {t('games.fatCat.sets.people', { n })}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <BottomAction>
        {readOnly ? (
          <Button size="lg" className="flex-1" onClick={copy}>
            <Copy data-icon="inline-start" />
            {t('games.fatCat.sets.copyToEdit')}
          </Button>
        ) : (
          <>
            <Button variant={sure ? 'destructive' : 'outline'} size="lg" onClick={remove} aria-label={t('games.fatCat.sets.delete')}>
              <Trash2 data-icon={sure ? 'inline-start' : undefined} />
              {sure && t('games.fatCat.sets.deleteSure')}
            </Button>
            <Button size="lg" className="flex-1" onClick={save}>
              <Save data-icon="inline-start" />
              {t('games.fatCat.sets.save')}
            </Button>
          </>
        )}
      </BottomAction>
    </div>
  )
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

