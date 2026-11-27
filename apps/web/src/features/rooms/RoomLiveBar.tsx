import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Crown, MonitorSmartphone, Unplug, WifiOff, X } from 'lucide-react'
import { useBoardDecision, useClaimHost, useRoomLink } from '@/api/rooms'
import { roomSocketsEnabled, seatLink } from '@/api/roomLink'
import type { Room } from '@/api/types'
import { QrCodeCard } from '@/components/friends/QrCodeCard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { showErrorToast, toastManager } from '@/lib/toast'
import { boardUrl } from './url'

/**
 * Things about the live connection that need me now, on every room screen:
 * another tab holds my seat, the host is gone, a Board Screen asks to pair.
 */
export function RoomLiveBar({ room, meId }: { room: Room; meId: string }) {
  const { t } = useTranslation()
  const link = useRoomLink()
  const claim = useClaimHost(room.code)
  const watching = link.watching === room.code
  const pending = room.hostId === meId ? room.boards.filter((b) => b.status === 'pending') : []
  const notices = []
  if (watching && link.connected && !link.control) {
    notices.push(
      <Notice key="control" text={t('rooms.live.viewOnly')}>
        <Button size="sm" onClick={() => seatLink.takeControl()}>{t('rooms.live.useHere')}</Button>
      </Notice>,
    )
  }
  if (roomSocketsEnabled() && watching && !link.connected) {
    notices.push(<p key="offline" className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><WifiOff className="size-3.5" aria-hidden="true" />{t('rooms.live.reconnecting')}</p>)
  }
  if (room.canClaimHost) {
    notices.push(
      <Notice key="host" text={t('rooms.live.hostAway')}>
        <Button size="sm" disabled={claim.isPending} onClick={() => claim.mutate(undefined, { onError: () => showErrorToast(t('common.saveError')) })}>
          <Crown data-icon="inline-start" />{t('rooms.live.claimHost')}
        </Button>
      </Notice>,
    )
  }
  for (const board of pending) notices.push(<BoardRequest key={board.id} code={room.code} id={board.id} label={board.label} />)
  if (!notices.length) return null
  return <div className="flex flex-col gap-2 px-4 pb-3" aria-live="polite">{notices}</div>
}

function Notice({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
      <p className="min-w-0 flex-1 text-sm text-balance">{text}</p>
      {children}
    </div>
  )
}

function BoardRequest({ code, id, label }: { code: string; id: string; label: string }) {
  const { t } = useTranslation()
  const approve = useBoardDecision(code, 'boardApprove')
  const reject = useBoardDecision(code, 'boardReject')
  const onError = () => showErrorToast(t('common.saveError'))
  const busy = approve.isPending || reject.isPending
  return (
    <Notice text={t('rooms.board.request', { label })}>
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.mutate(id, { onError })}>
          <X data-icon="inline-start" />{t('rooms.board.reject')}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => approve.mutate(id, { onError })}>
          <Check data-icon="inline-start" />{t('rooms.board.approve')}
        </Button>
      </div>
    </Notice>
  )
}

/** Owner, in the lobby: open a Board Screen on an iPad and see which screens are paired. */
export function BoardSection({ room }: { room: Room }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const revoke = useBoardDecision(room.code, 'boardRevoke')
  const url = boardUrl(room.code)
  const approved = room.boards.filter((b) => b.status === 'approved')
  async function copy() {
    try { await navigator.clipboard.writeText(url); toastManager.add({ title: t('rooms.linkCopied') }) }
    catch { showErrorToast(t('common.saveError')) }
  }
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-4" aria-label={t('rooms.board.title')}>
      <div className="flex items-start gap-3">
        <MonitorSmartphone className="mt-0.5 size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">{t('rooms.board.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('rooms.board.hint')}</p>
        </div>
      </div>
      {approved.map((b) => (
        <div key={b.id} className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2">
          <span className="min-w-0 flex-1 text-sm">{t('rooms.board.connected', { label: b.label })}</span>
          <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(b.id, { onError: () => showErrorToast(t('common.saveError')) })}>
            <Unplug data-icon="inline-start" />{t('rooms.board.revoke')}
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={() => setOpen(true)}>{t('rooms.board.open')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('rooms.board.open')} description={t('rooms.board.openHint')} className="items-center text-center">
          <QrCodeCard value={url} label={t('rooms.board.open')} />
          <Button variant="ghost" onClick={() => void copy()}><Copy data-icon="inline-start" />{t('rooms.board.copyLink')}</Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
