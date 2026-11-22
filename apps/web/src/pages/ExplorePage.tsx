import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Play } from 'lucide-react'
import { SectionHeader } from '@/components/common/SectionHeader'
import { FeaturedAction } from '@/components/explore/FeaturedAction'
import { ToolRow } from '@/components/explore/ToolRow'
import { GameTile } from '@/components/games/GameTile'
import { HeroHeader } from '@/components/layout/HeroHeader'
import { PET_SPECIES } from '@/components/pet/species'
import { Card } from '@/components/ui/card'
import { GAMES, isPlayable, gameById, type GameId } from '@/config/games'
import { TOOLS, type Tool } from '@/config/tools'
import { getMyPet } from '@/features/onboarding/storage'
import { SHOW_BACK } from '@/lib/nav'

/** The big game on top, then a grid of games people can start right away (#3 of the first-user review, #97). */
const FEATURED_GAME: GameId = 'headsUp'
const GRID_GAMES: GameId[] = ['spy', 'insider', 'spectrum', 'codewords', 'taboo', 'draw']

function ToolList({ tools }: { tools: Tool[] }) {
  return (
    <Card className="mx-4 px-4 py-1">
      {tools.map((tool) => (
        <ToolRow key={tool.id} tool={tool} />
      ))}
    </Card>
  )
}

// ทำอะไรดี: games first (that is what a group opens the app for), then meeting tools, then things to do alone.
export function ExplorePage() {
  const { t } = useTranslation()
  const pet = getMyPet()
  const ready = TOOLS.filter((tool) => tool.status === 'ready')
  const featured = ready.filter((tool) => tool.featured)
  const friends = ready.filter((tool) => tool.group === 'friends' && !tool.featured)
  const solo = ready.filter((tool) => tool.group === 'solo' && !tool.featured)
  const soon = TOOLS.filter((tool) => tool.status === 'soon')
  const gameCount = GAMES.filter(isPlayable).length
  const top = gameById(FEATURED_GAME)

  return (
    <div className="flex flex-col gap-6 pb-4">
      <HeroHeader
        title={t('pages.explore.title')}
        subtitle={t('pages.explore.subtitle')}
        tone="bg-lilac text-on-lilac"
        art={pet && <img src={PET_SPECIES[pet.species].poses.wave} alt="" className="-mr-3 -mb-3 w-36 shrink-0" />}
      />

      <section className="flex flex-col gap-2.5 px-4">
        <Link to={top.to} state={SHOW_BACK} className="on-slab pressable relative flex items-center gap-3 overflow-hidden rounded-[28px] bg-tangerine p-5">
          <span className="min-w-0 flex-1">
            <span className="inline-block rounded-full bg-ink px-2.5 text-xs leading-6 font-semibold text-ink-foreground">{t('explore.featuredTag')}</span>
            <span className="mt-1.5 block font-heading text-[32px] leading-tight font-extrabold">{t(`games.list.${top.id}.title`)}</span>
            <span className="block text-sm text-pretty text-muted-foreground">{t(`games.list.${top.id}.desc`)}</span>
            <span className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 font-semibold text-ink-foreground">
              <Play className="size-4" fill="currentColor" aria-hidden="true" />
              {t('explore.playNow')}
            </span>
          </span>
          <img src={top.art} alt="" draggable={false} className="-mr-2 size-28 shrink-0 -rotate-6" />
        </Link>
        <div className="stagger grid grid-cols-2 gap-2.5">
          {GRID_GAMES.map((id) => (
            <GameTile key={id} game={gameById(id)} />
          ))}
        </div>
        <Link to="/games" state={SHOW_BACK} className="pressable flex h-12 items-center justify-center gap-1 rounded-2xl bg-card text-[15px] font-semibold">
          {t('explore.allGames', { count: gameCount })}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionHeader title={t('explore.withFriends')} />
        {featured.map((tool) => (
          <div key={tool.id} className="px-4">
            <FeaturedAction tool={tool} />
          </div>
        ))}
        <ToolList tools={friends} />
      </section>

      <section>
        <SectionHeader title={t('explore.solo')} />
        <ToolList tools={solo} />
      </section>

      {soon.length > 0 && (
        <section>
          <SectionHeader title={t('explore.soon')} />
          <ToolList tools={soon} />
        </section>
      )}
    </div>
  )
}
