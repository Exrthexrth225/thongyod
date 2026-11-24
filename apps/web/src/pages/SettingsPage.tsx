import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Lock, MessageCircle, Sparkles } from 'lucide-react'
import { IconTile } from '@/components/common/IconTile'
import { ListRow } from '@/components/common/ListRow'
import { SectionHeader } from '@/components/common/SectionHeader'
import { ModeChoice } from '@/components/common/ModeChoice'
import { SegmentedChoice } from '@/components/common/SegmentedChoice'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { getLanguage, setLanguage, type Language } from '@/i18n'
import { getMode, setMode, type Mode } from '@/lib/theme'

// /settings — opened from the gear on "ฉัน" (decision #36).
export function SettingsPage() {
  const { t } = useTranslation()
  const [mode, setModeState] = useState<Mode>(getMode)
  const language = getLanguage()

  return (
    <div className="flex flex-col gap-3 pb-8">
      <PageHeader title={t('settings.title')} backTo="/me" />

      <section>
        <SectionHeader title={t('pages.me.theme')} />
        <div className="px-4">
          <ModeChoice
            value={mode}
            onChange={(next) => {
              setMode(next)
              setModeState(next)
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground">{t('pages.me.themeHint')}</p>
        </div>
      </section>

      <section>
        <SectionHeader title={t('pages.me.language')} />
        <div className="px-4">
          {/* Language names are always shown in their own language. */}
          <SegmentedChoice<Language>
            label={t('pages.me.chooseLanguage')}
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'th', label: 'ไทย' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
      </section>

      <section>
        <SectionHeader title={t('settings.more')} />
        <Card className="mx-4 px-4 py-1">
          <ListRow leading={<IconTile icon={Bell} />} title={t('settings.notifications')} to="/settings/notifications" />
          <ListRow leading={<IconTile icon={Lock} />} title={t('settings.privacy')} subtitle={t('explore.soon')} />
          <ListRow leading={<IconTile icon={MessageCircle} />} title={t('settings.lineAccount')} subtitle={t('explore.soon')} />
          <ListRow leading={<IconTile icon={Sparkles} />} title={t('settings.replayWelcome')} to="/welcome" />
        </Card>
      </section>
    </div>
  )
}
