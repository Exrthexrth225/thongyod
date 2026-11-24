import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Award, ChevronRight, Lock, Users } from 'lucide-react'
import type { EarnedTitle, Profile } from '@/api/types'
import { Avatar } from '@/components/common/Avatar'
import { AvatarStack } from '@/components/common/AvatarStack'
import { SectionHeader } from '@/components/common/SectionHeader'
import { SeeAllLink } from '@/components/common/SeeAllLink'
import { MeetupRow } from '@/components/meetup/MeetupRow'
import { Card } from '@/components/ui/card'
import { formatMonthYear } from '@/lib/date'
import { SHOW_BACK } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { TitleSheet } from './TitleSheet'

/** The title chip under the name: one quiet colour, the award icon carries the brand (#132). */
const TITLE_CHIP = 'mt-1 flex items-center gap-1 rounded-xl bg-card px-2.5 py-0.5 text-[13px] font-semibold'

/** Chip sections (titles, shared gangs) show this many; the rest are behind "ดูทั้งหมด". */
const CHIP_PREVIEW = 6

type ProfileViewProps = {
  profile: Profile
  /** Buttons under the name: "แก้ไขโปรไฟล์ + QR" for me; friend actions for others. */
  actions: ReactNode
  /** Extra sections at the end, e.g. "ของฉัน" on my own tab. */
  children?: ReactNode
}

// Profile page body (decisions #36, #44, #45). Same view for me, friends and non-friends;
// sections appear only when the API sends them (non-friends get less).
export function ProfileView({ profile, actions, children }: ProfileViewProps) {
  const { t } = useTranslation()
  const isSelf = profile.relationship === 'self'
  const limited = !isSelf && profile.relationship !== 'friend'
  const [openTitle, setOpenTitle] = useState<EarnedTitle | null>(null)
  // The main title under the name opens its sheet when it is one of the earned titles we can see.
  const mainTitle = profile.title ? (profile.titles ?? []).find((x) => x.name === profile.title) : undefined

  return (
    <div className="flex flex-col gap-3 pb-6">
      {/* Cover: uploaded photo, or the theme color. */}
      <div className="mx-4 h-[132px] overflow-hidden rounded-[28px] bg-lilac/45" aria-hidden="true">
        {profile.coverUrl && <img src={profile.coverUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="-mt-[52px] flex flex-col items-center gap-1 px-4 text-center">
        <Avatar name={profile.displayName} src={profile.avatarUrl} className="size-24 text-[40px] ring-[5px] ring-background" />
        <h2 className="mt-1.5 font-heading text-2xl leading-tight font-bold">{profile.displayName}</h2>
        <p className="text-sm text-muted-foreground">@{profile.handle}</p>
        {profile.title &&
          (mainTitle ? (
            <button type="button" onClick={() => setOpenTitle(mainTitle)} className={cn(TITLE_CHIP, 'pressable')}>
              <Award className="size-3.5 text-brand" aria-hidden="true" />
              {profile.title}
            </button>
          ) : (
            <span className={TITLE_CHIP}>
              <Award className="size-3.5 text-brand" aria-hidden="true" />
              {profile.title}
            </span>
          ))}
        {profile.bio && <p className="mt-1 max-w-xs text-sm">{profile.bio}</p>}
        {profile.friendsSince && (
          <p className="text-xs text-muted-foreground">
            {t('profile.friendsSince', { date: formatMonthYear(new Date(profile.friendsSince)) })}
          </p>
        )}
      </div>

      <div className="flex justify-center gap-2 px-4 pt-1">{actions}</div>

      {profile.stats && (
        <div className="mx-4 grid grid-cols-3 gap-2.5 text-center">
          {[
            { key: 'friends', value: profile.stats.friends, label: t('profile.stats.friends'), to: isSelf ? '/gangs/friends' : profile.mutualFriends > 0 ? `/u/${profile.userId}/mutual` : null },
            { key: 'gangs', value: profile.stats.gangs, label: t('profile.stats.gangs'), to: isSelf ? '/gangs' : null },
            { key: 'attended', value: profile.stats.meetupsAttended, label: t('profile.stats.attended'), to: isSelf ? '/plan?view=past' : null },
          ].map((s) => {
            const body = (
              <>
                <span className="block font-heading text-2xl leading-tight font-bold tabular-nums">{s.value}</span>
                <span className="flex items-center justify-center gap-0.5 text-xs text-muted-foreground">
                  {s.label}
                  {s.to && <ChevronRight className="size-3" aria-hidden="true" />}
                </span>
              </>
            )
            return s.to ? (
              <Link key={s.key} to={s.to} state={SHOW_BACK} className="pressable rounded-[20px] bg-card py-3">
                {body}
              </Link>
            ) : (
              <div key={s.key} className="rounded-[20px] bg-card py-3">
                {body}
              </div>
            )
          })}
        </div>
      )}

      {limited && (
        <p className="flex items-center justify-center gap-1.5 px-6 text-center text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          {t('profile.limitedHint')}
        </p>
      )}

      {profile.upcomingTogether && profile.upcomingTogether.length > 0 && (
        <section>
          <SectionHeader title={t('profile.upcomingTogether')} />
          <Card className="mx-4 px-4 py-1">
            {profile.upcomingTogether.map((m) => (
              <MeetupRow key={m.id} meetup={m} showDay />
            ))}
          </Card>
        </section>
      )}

      {profile.sharedGangs.length > 0 && (
        <section>
          <SectionHeader
            title={t('profile.sharedGangs', { count: profile.sharedGangs.length })}
            action={profile.sharedGangs.length > CHIP_PREVIEW && <SeeAllLink to={`/u/${profile.userId}/gangs`} />}
          />
          <div className="flex flex-wrap gap-2 px-4">
            {profile.sharedGangs.slice(0, CHIP_PREVIEW).map((g) => (
              <Link key={g.id} to={`/gangs/${g.id}`} className="flex min-h-9 items-center gap-1.5 rounded-3xl bg-card px-3 py-1.5 text-sm active:opacity-70">
                <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                {g.name}
                <ChevronRight className="-mr-1 size-3.5 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {!isSelf && profile.mutualFriends > 0 && (
        <section>
          <SectionHeader
            title={t('profile.mutualTitle', { count: profile.mutualFriends })}
            action={<SeeAllLink to={`/u/${profile.userId}/mutual`} />}
          />
          <Link to={`/u/${profile.userId}/mutual`} className="mx-4 flex items-center gap-3 rounded-3xl bg-card p-3 active:opacity-80">
            <AvatarStack names={profile.mutualPreview.map((p) => p.displayName)} total={profile.mutualFriends} />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {profile.mutualPreview.map((p) => p.displayName).join(', ')}
            </span>
          </Link>
        </section>
      )}

      {profile.titles && profile.titles.length > 0 && (
        <section>
          <SectionHeader
            title={t('profile.titles', { count: profile.titles.length })}
            action={profile.titles.length > CHIP_PREVIEW && <SeeAllLink to={`/u/${profile.userId}/titles`} />}
          />
          <div className="flex flex-wrap gap-2 px-4">
            {profile.titles.slice(0, CHIP_PREVIEW).map((title) => (
              <button
                key={title.id}
                type="button"
                onClick={() => setOpenTitle(title)}
                className="pressable flex min-h-9 items-center gap-1.5 rounded-3xl bg-card px-3 py-1.5 text-sm"
              >
                <Award className="size-4 text-brand" aria-hidden="true" />
                {title.name}
                {title.gangName && <span className="text-xs text-muted-foreground">· {title.gangName}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {children}

      <TitleSheet title={openTitle} onClose={() => setOpenTitle(null)} />
    </div>
  )
}
