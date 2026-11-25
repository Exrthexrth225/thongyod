import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SeeAllLink } from '@/components/common/SeeAllLink'
import { GAMES, isPlayable, type Game } from '@/config/games'
import { recentStore } from '@/features/games/library'
import { softTintClass } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { SHOW_BACK } from '@/lib/nav'

/** Shown until the user has played three games of their own. */
const STARTERS = ['fatCat', 'headsUp', 'spy']

// "เล่นต่อ" (#132): the last three games played (or three starters), so Home shows this app also has games.
export function KeepPlaying() {
  const { t } = useTranslation()
  const recent = recentStore.use()
  const ids = [...new Set([...recent, ...STARTERS])]
  const games = ids
    .map((id) => GAMES.find((g) => g.id === id))
    .filter((g): g is Game => !!g && isPlayable(g))
    .slice(0, 3)
  return (
    <section>
      <SectionHeader title={t('home.keepPlaying')} action={<SeeAllLink to="/games" label={t('home.allGames')} linkState={SHOW_BACK} />} />
      <div className="grid grid-cols-3 gap-2.5 px-4">
        {games.map((game) => (
          <Link key={game.id} to={game.to} className={cn('pressable flex flex-col items-center gap-1 rounded-[20px] px-2 py-3 text-center', softTintClass(game.tint))}>
            {game.art ? <img src={game.art} alt="" className="size-16" draggable={false} /> : <game.icon className="size-16 p-3" aria-hidden="true" />}
            <span className="text-sm leading-tight font-semibold text-balance">{t(`games.list.${game.id}.title`)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
