import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pin, Search, Users, X } from 'lucide-react'
import multiDeviceArt from '@/assets/tools/multiDevice.webp'
import { SectionHeader } from '@/components/common/SectionHeader'
import { GameTile } from '@/components/games/GameTile'
import { ROUND_BUTTON, TabHeader } from '@/components/layout/TabHeader'
import { Input } from '@/components/ui/input'
import { GAMES, isPlayable, type Game, type GameKind } from '@/config/games'
import { TOOLS } from '@/config/tools'
import { fitsGroup, pinStore, recentStore, topRow } from '@/features/games/library'
import { useGameSettings } from '@/lib/gameSettings'
import { SHOW_BACK } from '@/lib/nav'
import { softTintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'

/** Sections that scroll sideways; toys get a small grid of their own. */
const ROWS: GameKind[] = ['drink', 'party', 'board']
/** Group sizes to filter by in search; the last one means "this many or more". */
const SIZES = [2, 3, 4, 5, 6, 7, 8, 10] as const
const RECENT_SHOWN = 4

const byId = new Map<string, Game>(GAMES.map((g) => [g.id, g]))
const playable = GAMES.filter(isPlayable)
const soon = GAMES.filter((g) => !isPlayable(g))
const luckyColor = TOOLS.find((tool) => tool.id === 'luckyColor')

// The เกม tab (#132): what we played last, play on several phones, one sideways row per kind of game,
// toys & luck (เซียมซี and สีมงคล live here). Games still being built end their row, locked. The group-size filter moved into search.
export function GamesPage() {
  const { t } = useTranslation()
  const [searching, setSearching] = useState(false)
  const pins = pinStore.use()
  const recent = recentStore.use()
  const top = topRow(pins, recent, (id) => { const g = byId.get(id); return !!g && isPlayable(g) }).slice(0, RECENT_SHOWN)

  return (
    <div className="flex flex-col gap-2 pb-6">
      <TabHeader title={t('nav.games')}>
        <button type="button" onClick={() => setSearching((on) => !on)} aria-pressed={searching} className={ROUND_BUTTON} aria-label={searching ? t('games.searchClose') : t('games.search')}>
          {searching ? <X className="size-[22px]" aria-hidden="true" /> : <Search className="size-[22px]" aria-hidden="true" />}
        </button>
      </TabHeader>

      {searching ? (
        <GameSearch />
      ) : (
        <>
          {top.length > 0 && (
            <section>
              <SectionHeader title={t('games.recent')} />
              <div className="grid grid-cols-4 gap-2 px-4">
                {top.map(({ id, pinned }) => {
                  const g = byId.get(id)!
                  return (
                    <Link key={id} to={g.to} state={SHOW_BACK} className={cn('pressable relative flex flex-col items-center gap-0.5 rounded-[18px] px-1 py-2 text-center', softTintClass(g.tint))}>
                      {pinned && <Pin className="absolute top-1.5 right-1.5 size-3" aria-label={t('games.pinned')} />}
                      {g.art ? <img src={g.art} alt="" draggable={false} className="size-12" /> : <g.icon className="size-12 p-2" aria-hidden="true" />}
                      <span className="line-clamp-2 text-xs leading-tight font-semibold">{t(`games.list.${g.id}.title`)}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <Link to="/games/rooms" state={SHOW_BACK} className="pressable mx-4 mt-2 flex items-center gap-3 rounded-[20px] bg-card px-3.5 py-3">
            <img src={multiDeviceArt} alt="" className="size-11 shrink-0" draggable={false} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{t('games.roomsBanner.title')}</span>
              <span className="block text-sm text-muted-foreground">{t('games.roomsBanner.text')}</span>
            </span>
            <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
          </Link>

          {ROWS.map((kind) => {
            const ready = playable.filter((g) => g.kind === kind)
            // Games still being built close the row, locked, so each kind shows what is coming.
            const list = [...ready, ...soon.filter((g) => g.kind === kind)]
            if (!list.length) return null
            return (
              <section key={kind}>
                <SectionHeader title={t(`games.kinds.${kind}`)} action={<span className="text-sm text-muted-foreground">{t('games.count', { count: ready.length })}</span>} />
                <div className="flex snap-x gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none]">
                  {list.map((g) => (
                    <GameTile key={g.id} game={g} soft className="w-[156px] shrink-0 snap-start" />
                  ))}
                </div>
              </section>
            )
          })}

          <section>
            <SectionHeader title={t('games.kinds.toy')} />
            <div className="grid grid-cols-4 gap-2 px-4">
              {playable
                .filter((g) => g.kind === 'toy')
                .map((g) => (
                  <ToyTile key={g.id} to={g.to} art={g.art} title={t(`games.list.${g.id}.title`)} />
                ))}
              {luckyColor && <ToyTile to={luckyColor.to!} art={luckyColor.art} title={t('tools.luckyColor.title')} />}
            </div>
          </section>

        </>
      )}
    </div>
  )
}

function ToyTile({ to, art, title }: { to: string; art?: string; title: string }) {
  return (
    <Link to={to} state={SHOW_BACK} className="pressable flex flex-col items-center gap-1 rounded-[18px] bg-card px-1 py-2.5 text-center">
      {art && <img src={art} alt="" draggable={false} className="size-12" />}
      <span className="text-xs leading-tight font-semibold text-balance">{title}</span>
    </Link>
  )
}

// Search (#132): by name, and "วงนี้กี่คน" to hide games that do not fit the group. The size is remembered.
function GameSearch() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [{ size }, setFilter] = useGameSettings<{ size: number | null }>('library', { size: null })
  const q = query.trim().toLowerCase()
  const results = [...playable, ...soon].filter(
    (g) => fitsGroup(g.players, size) && (!q || t(`games.list.${g.id}.title`).toLowerCase().includes(q)),
  )
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="px-4">
        <Input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('games.searchPlaceholder')} aria-label={t('games.search')} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label={t('games.groupSize')}>
        <span className="flex shrink-0 items-center gap-1 pr-1 text-sm font-semibold">
          <Users className="size-4" aria-hidden="true" />
          {t('games.groupSize')}
        </span>
        {[null, ...SIZES].map((n) => (
          <button
            key={n ?? 'all'}
            type="button"
            aria-pressed={size === n}
            onClick={() => setFilter({ size: n })}
            className={cn('pressable h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold tabular-nums', size === n ? 'bg-ink text-ink-foreground' : 'bg-card')}
          >
            {n === null ? t('games.sizeAll') : n === 10 ? '10+' : n}
          </button>
        ))}
      </div>
      {results.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('games.noResults')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-4">
          {results.map((g) => (
            <GameTile key={g.id} game={g} soft />
          ))}
        </div>
      )}
    </div>
  )
}
