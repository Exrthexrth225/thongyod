import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pin, Users, Wifi } from 'lucide-react'
import { SectionHeader } from '@/components/common/SectionHeader'
import { GameTile } from '@/components/games/GameTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { GAMES, isPlayable, type Game, type GameKind } from '@/config/games'
import { fitsGroup, pinStore, recentStore, topRow } from '@/features/games/library'
import { useGameSettings } from '@/lib/gameSettings'
import { SHOW_BACK } from '@/lib/nav'
import { tintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'

const SECTIONS: GameKind[] = ['drink', 'party', 'board', 'toy']
/** Group sizes to filter by; the last one means "this many or more". */
const SIZES = [2, 3, 4, 5, 6, 7, 8, 10] as const

const byId = new Map<string, Game>(GAMES.map((g) => [g.id, g]))

// /games — every game by section (#92). On top (#123): "วงนี้กี่คน" hides games that do not fit, and one row of
// pinned + recently played games. The sections themselves never reorder, so a game is always where you left it.
export function GamesPage() {
  const { t } = useTranslation()
  const [{ size }, setFilter] = useGameSettings<{ size: number | null }>('library', { size: null })
  const pins = pinStore.use()
  const recent = recentStore.use()
  const top = topRow(pins, recent, (id) => { const g = byId.get(id); return !!g && isPlayable(g) })

  return (
    <div className="flex flex-col gap-2 pb-8">
      <PageHeader title={t('games.title')} subtitle={t('games.subtitle')} backTo="/explore" />

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label={t('games.groupSize')}>
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

      {top.length > 0 && (
        <section>
          <SectionHeader title={t('games.ours')} muted />
          <div className="flex gap-2 overflow-x-auto px-4 pb-1">
            {top.map(({ id, pinned }) => {
              const g = byId.get(id)!
              return (
                <Link key={id} to={g.to} state={SHOW_BACK} className={cn('pressable relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-3xl p-2.5 text-center', tintClass(g.tint))}>
                  {pinned && <Pin className="absolute top-2 right-2 size-3.5" aria-label={t('games.pinned')} />}
                  {g.art ? <img src={g.art} alt="" draggable={false} className="size-12" /> : <g.icon className="size-10 p-1" aria-hidden="true" />}
                  <span className="line-clamp-2 text-xs leading-tight font-bold">{t(`games.list.${g.id}.title`)}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <Link to="/games/rooms" state={SHOW_BACK} className="mx-4 mt-1 flex items-center gap-3 rounded-3xl bg-card p-4 active:scale-[0.99]">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', tintClass(5))}>
          <Wifi className="size-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t('games.roomsBanner.title')}</span>
          <span className="block text-xs text-muted-foreground">{t('games.roomsBanner.text')}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      {SECTIONS.map((kind) => {
        const list = GAMES.filter((g) => g.kind === kind && fitsGroup(g.players, size === 10 ? 10 : size)).sort((a, b) => Number(a.status === 'soon') - Number(b.status === 'soon'))
        if (!list.length) return null
        return (
          <section key={kind}>
            <SectionHeader title={t(`games.kinds.${kind}`)} />
            <div className="stagger grid grid-cols-2 gap-2 px-4">
              {list.map((g) => (
                <GameTile key={g.id} game={g} />
              ))}
            </div>
          </section>
        )
      })}
      {size !== null && !GAMES.some((g) => fitsGroup(g.players, size)) && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('games.noneForSize')}</p>}
    </div>
  )
}
