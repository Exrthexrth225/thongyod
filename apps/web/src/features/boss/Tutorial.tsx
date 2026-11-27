import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Word } from './Word'
import { cardArt, faceArt, fxArt, markTutorialSeen, moneyArt } from './meta'

/** Four quick pages the first time someone plays (and from the menu): goal, your turn, the deal, trouble cards. */
export function BossTutorial({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const pages = [
    { title: t('boss.tutorial.t1'), text: t('boss.tutorial.d1'), art: [faceArt('yellow', 'happy'), moneyArt('briefcase'), faceArt('blue', 'happy')] },
    { title: t('boss.tutorial.t2'), text: t('boss.tutorial.d2'), art: [fxArt('pawn'), moneyArt('coins')] },
    { title: t('boss.tutorial.t3'), text: t('boss.tutorial.d3'), art: [faceArt('red'), cardArt('recruit'), faceArt('purple')] },
    { title: t('boss.tutorial.t4'), text: t('boss.tutorial.d4'), art: [cardArt('travel'), cardArt('boss'), cardArt('stop')] },
  ]
  const last = page === pages.length - 1
  const close = () => { markTutorialSeen(); onClose() }
  const p = pages[page]
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#120d2b]/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('boss.act.howTo')}>
      <div className="flex w-full max-w-xl items-center gap-5 rounded-[28px] bg-[#f6efdc] p-5 text-[#241b4b] shadow-2xl">
        <div key={page} className="boss-tut-art flex w-44 shrink-0 items-end justify-center -space-x-4">
          {p.art.map((src, i) => <img key={i} src={src} alt="" className={cn('drop-shadow-xl', i === 1 && p.art.length === 3 ? 'z-10 size-20' : 'size-16')} style={{ animationDelay: `${i * 90}ms` }} draggable={false} />)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-xs font-bold text-[#9a6b00]">{page + 1}/{pages.length}</span>
          <h2 key={`t${page}`} className="boss-tut-text"><Word text={p.title} className="text-left text-[26px]" /></h2>
          <p key={`d${page}`} className="boss-tut-text text-sm leading-snug">{p.text}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1.5" aria-hidden="true">
              {pages.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === page ? 'w-6 bg-[#241b4b]' : 'w-1.5 bg-[#241b4b]/25')} />)}
            </div>
            {!last && <Button variant="ghost" className="text-[#241b4b]" onClick={close}>{t('boss.tutorial.skip')}</Button>}
            <Button className="min-w-28" onClick={() => (last ? close() : setPage(page + 1))}>{last ? t('boss.tutorial.start') : t('boss.tutorial.next')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
