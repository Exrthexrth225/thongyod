import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { newBill } from '@/features/bill-split/bill'
import { BillRow } from '@/features/bill-split/BillRow'
import { addBill, useBills } from '@/features/bill-split/storage'
import { intlLocale } from '@/i18n'

// หารบิล home (DECISIONS #53): bills kept on this device, newest first.
export function BillsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const bills = useBills()

  function start() {
    const date = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' }).format(new Date())
    const bill = newBill(t('billSplit.defaultTitle', { date }), t('billSplit.me'))
    addBill(bill)
    void navigate(`/bills/${bill.id}`)
  }

  return (
    <>
      <PageHeader title={t('billSplit.title')} subtitle={t('billSplit.subtitle')} backTo="/plan" />
      <div className="flex flex-col gap-4 px-4 pb-8">
        <Button size="lg" onClick={start}>
          <Plus data-icon="inline-start" />
          {t('billSplit.newBill')}
        </Button>
        {bills.length === 0 ? (
          <EmptyState pet="eat" title={t('billSplit.emptyTitle')} hint={t('billSplit.emptyHint')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {bills.map((bill) => (
              <BillRow key={bill.id} bill={bill} />
            ))}
          </ul>
        )}
        <p className="text-center text-xs text-muted-foreground">{t('billSplit.storedHere')}</p>
      </div>
    </>
  )
}
