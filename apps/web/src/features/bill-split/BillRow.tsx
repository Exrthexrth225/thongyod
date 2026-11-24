import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Clock, NotebookPen } from 'lucide-react'
import { Badge } from '@/components/common/Badge'
import { formatDayLabel } from '@/lib/date'
import { formatBaht } from '@/lib/money'
import { billStatus, settle, type Bill } from './bill'
import { Faces } from './Faces'

const STATUS_ICON = { jotting: NotebookPen, waiting: Clock, cleared: CircleCheck } as const

// One bill in a list: title, date, who is in it, total and where it stands. Bills page and the นัด tab.
export function BillRow({ bill }: { bill: Bill }) {
  const { t } = useTranslation()
  const s = settle(bill)
  const { status, waiting } = billStatus(bill, s)
  const Icon = STATUS_ICON[status]
  return (
    <li>
      <Link to={`/bills/${bill.id}`} className="flex flex-col gap-2 rounded-3xl bg-card p-3 active:bg-muted/50">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{bill.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatDayLabel(new Date(bill.createdAt))}</span>
        </span>
        <span className="flex items-center gap-2">
          <Faces bill={bill} ids={bill.people.slice(0, 6).map((p) => p.id)} />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {t('billSplit.entriesCount', { count: bill.entries.length })}
            {s.total > 0 && ` · ${formatBaht(s.total)}`}
          </span>
          <Badge tone={status === 'cleared' ? 'success' : status === 'waiting' ? 'warning' : 'neutral'} icon={Icon}>
            {t(`billSplit.status.${status}`, { count: waiting })}
          </Badge>
        </span>
      </Link>
    </li>
  )
}
