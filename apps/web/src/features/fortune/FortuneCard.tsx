import { useTranslation } from 'react-i18next'
import flower from '@/assets/fortune/flower.webp'
import { Badge } from '@/components/common/Badge'
import { fortuneOf, levelOf, type StickNo } from './logic'
import { LEVEL_TONE } from './levelTone'
import './fortune.css'

// The fortune paper (#131): number + level, the verse as on a shrine slip (4 บท; the 2nd and 4th วรรค of each บท are
// set in, like printed กลอน), what it means in plain words, and for a bad slip how to ease it.
export function FortuneCard({ stick }: { stick: StickNo }) {
  const { t } = useTranslation()
  const level = levelOf(stick)
  const f = fortuneOf(stick)
  if (!f) return null
  const stanzas = [0, 1, 2, 3].map((b) => f.verse.slice(b * 4, b * 4 + 4))
  return (
    <article className="fortune-paper text-center">
      <img src={flower} alt="" className="fortune-paper-flower" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <span className="paper-soft text-sm">{t('fortune.stickNo', { n: stick })}</span>
        <Badge tone={LEVEL_TONE[level]} className="px-3 py-1 text-sm">
          {t(`fortune.levels.${level}`)}
        </Badge>
      </div>
      <div className="mx-auto my-5 flex w-fit flex-col gap-3 text-left font-heading text-[17px] leading-relaxed">
        {stanzas.map((lines, b) => (
          <p key={b} className="verse-line" style={{ animationDelay: `${0.45 + b * 0.25}s` }}>
            {lines.map((line, i) => (
              <span key={i} className={i % 2 ? 'block pl-6' : 'block'}>
                {line}
              </span>
            ))}
          </p>
        ))}
      </div>
      <div className="paper-line border-t border-dashed pt-3 text-left text-sm leading-relaxed">
        <p className="paper-soft text-xs">{t('fortune.meaning')}</p>
        <p>{f.meaning}</p>
      </div>
      {f.remedy && (
        <div className="paper-chip mt-3 rounded-xl px-3 py-2.5 text-left text-sm leading-relaxed">
          <p className="paper-soft text-xs">{t('fortune.remedy')}</p>
          <p>{f.remedy}</p>
        </div>
      )}
    </article>
  )
}
