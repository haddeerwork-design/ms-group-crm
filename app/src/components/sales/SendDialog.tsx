import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, FileDown, Mail, MessageCircle, Send, Share2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { hasWhatsappNumber, mailtoUrl, sendMessage, whatsappUrl, type SendDoc } from '@/lib/send'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Send a quotation / proforma: 1) save the PDF, 2) send it by WhatsApp or email
 * with a ready message, 3) (optional) mark it as sent in the system.
 * The browser cannot attach the PDF by itself, so step 1 comes first.
 */
export function SendDialog({ open, onOpenChange, doc, email, phone, onPdf, onMarkSent, markLabel = 'Mark as sent' }: {
  open: boolean; onOpenChange: (o: boolean) => void; doc: SendDoc
  email?: string | null; phone?: string | null
  onPdf: () => void; onMarkSent?: () => void; markLabel?: string
}) {
  const { t } = useT()
  const [to, setTo] = useState({ email: '', phone: '' })
  const [msg, setMsg] = useState({ subject: '', body: '' })
  const [pdfDone, setPdfDone] = useState(false)
  const [sentVia, setSentVia] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setTo({ email: email ?? '', phone: phone ?? '' }); setMsg(sendMessage(doc)); setPdfDone(false); setSentVia(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && /android|iphone|ipad|mobile/i.test(navigator.userAgent)
  const go = (via: string, url: string) => { window.open(url, '_blank', 'noopener'); setSentVia(via) }
  async function copy() {
    try { await navigator.clipboard.writeText(`${msg.subject}\n\n${msg.body}`); toast.success('Message copied'); setSentVia('copy') }
    catch { toast.error('Could not copy. Select the text and copy it.') }
  }
  async function share() {
    try { await navigator.share({ title: msg.subject, text: msg.body }); setSentVia('share') } catch { /* closed */ }
  }

  const step = (n: number, done: boolean) => (
    <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', done ? 'bg-emerald-600 text-white' : 'bg-primary/10 text-primary')}>{done ? <Check className="size-3.5" /> : n}</span>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(doc.kind === 'quotation' ? 'Send quotation {n}' : 'Send proforma {n}', { n: doc.number })}</DialogTitle>
          <DialogDescription>{t('Save the PDF, then send it with a ready message. You can edit the message.')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <section className="flex gap-3">
            {step(1, pdfDone)}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="font-medium">{t('Save the PDF')}</div>
              <p className="text-xs text-muted-foreground">{t('In the print window choose “Save as PDF”. You will attach this file in the next step.')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => { onPdf(); setPdfDone(true) }}><FileDown />{t('Open PDF')}</Button>
            </div>
          </section>

          <section className="flex gap-3">
            {step(2, !!sentVia)}
            <div className="min-w-0 flex-1 space-y-3">
              <div className="font-medium">{t('Send it')}</div>
              <Field label="Subject (email)"><Input value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} dir="auto" /></Field>
              <Field label="Message"><Textarea rows={7} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} dir="auto" /></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="WhatsApp number"><Input value={to.phone} onChange={(e) => setTo({ ...to, phone: e.target.value })} placeholder="+971 50 123 4567" dir="ltr" inputMode="tel" /></Field>
                <Field label="Email"><Input type="email" value={to.email} onChange={(e) => setTo({ ...to, email: e.target.value })} dir="ltr" /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="bg-[#1fa855] text-white hover:bg-[#178c46]" onClick={() => go('whatsapp', whatsappUrl(to.phone, msg.body))}>
                  <MessageCircle />{t(hasWhatsappNumber(to.phone) ? 'WhatsApp' : 'WhatsApp (choose chat)')}</Button>
                <Button type="button" variant="outline" onClick={() => go('email', mailtoUrl(to.email, msg.subject, msg.body))}><Mail />{t('Email')}</Button>
                {canShare && <Button type="button" variant="outline" onClick={share}><Share2 />{t('Share…')}</Button>}
                <Button type="button" variant="ghost" onClick={copy}><Copy />{t('Copy message')}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('Remember to attach the PDF you saved in step 1.')}</p>
            </div>
          </section>

          {onMarkSent && (
            <section className="flex gap-3">
              {step(3, false)}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-medium">{t('Record it')}</div>
                <p className="text-xs text-muted-foreground">{t(doc.kind === 'quotation'
                  ? 'Mark it as sent so it is locked, the customer moves to “Quotation sent” and a follow-up reminder is added.'
                  : 'Issue it so it is locked and this version is kept.')}</p>
              </div>
            </section>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{onMarkSent ? 'Not now' : 'Close'}</Button>
          {onMarkSent && <Button type="button" onClick={() => { onOpenChange(false); onMarkSent() }}><Send />{t(markLabel)}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
