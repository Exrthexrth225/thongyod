import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import type { Tool } from '@/config/tools'
import { SHOW_BACK } from '@/lib/nav'

// Big yolk block for the main action of a group (e.g. "ชวนนัด", #97).
export function FeaturedAction({ tool }: { tool: Tool }) {
  const { t } = useTranslation()
  if (!tool.to) return null
  return (
    <Link to={tool.to} state={SHOW_BACK} className="on-slab pressable flex items-center gap-3 rounded-3xl bg-yolk p-4">
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-yolk">
        <tool.icon className="size-6" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-xl leading-snug font-bold">{t(`tools.${tool.id}.title`)}</span>
        <span className="block text-[13px] text-muted-foreground">{t(`tools.${tool.id}.desc`)}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
    </Link>
  )
}
