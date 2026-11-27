import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { GuestEntry } from '@/features/rooms/RoomAccess'
import { Word } from './Word'
import { faceArt, fxArt, TEAMS } from './meta'
import './boss.css'

/** Joining an I'm the Boss! room without an account: the game's look, one nickname box, in. */
export function BossEntry({ returnTo }: { returnTo: string }) {
  const { t } = useTranslation()
  return (
    <section className="relative isolate -mt-2 flex min-h-[calc(100dvh-4rem)] flex-col items-center gap-5 overflow-hidden bg-[radial-gradient(ellipse_at_50%_20%,#2c2360,#17142b_60%,#120d2b)] px-6 py-8 text-white">
      <img src={fxArt('confetti')} alt="" aria-hidden="true" className="pointer-events-none absolute -top-6 left-1/2 -z-10 w-[36rem] max-w-none -translate-x-1/2 opacity-40" />
      <div className="flex items-end justify-center -space-x-3" aria-hidden="true">
        {TEAMS.map((team, i) => <img key={team} src={faceArt(team, i % 2 ? 'happy' : 'calm')} alt="" className="boss-lobby-face size-16 rounded-full bg-white/90 object-contain ring-4 ring-[#17142b]" style={{ animationDelay: `${i * 90}ms` }} />)}
      </div>
      <h1 className="text-center"><Word text={t('games.list.boss.title')} className="text-[clamp(34px,10vw,52px)]" /></h1>
      <p className="max-w-xs text-center text-sm text-white/75">{t('boss.entry.tagline')}</p>
      <div className="w-full max-w-sm rounded-3xl bg-card p-5 text-foreground shadow-2xl">
        <GuestEntry returnTo={returnTo} />
      </div>
      <Link className="min-h-11 py-3 text-center text-sm text-white/80 underline underline-offset-4" to={'/login?returnTo=' + encodeURIComponent(returnTo)}>{t('auth.withLine')}</Link>
    </section>
  )
}
