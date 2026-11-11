import { fmtDateDMY } from './quotations'

export type SendDoc = {
  kind: 'quotation' | 'proforma'
  number: string; version?: number | null
  lang?: 'en' | 'ar' | null
  contactName?: string | null; company?: string | null
  validUntil?: string | null
  sender?: string | null // the employee's name
  brandName: string // MS El-brancy Group / Prime Roots
}

/** The message that goes with the PDF, in the document's language. Editable before sending. */
export function sendMessage(d: SendDoc): { subject: string; body: string } {
  const ref = `${d.number}${d.version && d.version > 1 ? ` rev. ${d.version}` : ''}`
  const who = d.contactName?.trim() || ''
  if (d.lang === 'ar') {
    const what = d.kind === 'quotation' ? 'عرض السعر' : 'الفاتورة المبدئية (بروفورما)'
    return {
      subject: `${what} رقم ${ref} — ${d.brandName}`,
      body: [
        who ? `السيد/ة ${who}،` : 'السادة الكرام،',
        '',
        `تحية طيبة، مرفق ${what} رقم ${ref}${d.kind === 'quotation' && d.validUntil ? ` (ساري حتى ${fmtDateDMY(d.validUntil)})` : ''}.`,
        'يسعدنا الرد على أي استفسار.',
        '',
        'مع خالص التحية،',
        [d.sender, d.brandName].filter(Boolean).join(' — '),
      ].join('\n'),
    }
  }
  const what = d.kind === 'quotation' ? 'quotation' : 'proforma invoice'
  return {
    subject: `${d.kind === 'quotation' ? 'Quotation' : 'Proforma invoice'} ${ref} — ${d.brandName}`,
    body: [
      `Dear ${who || 'Sir / Madam'},`,
      '',
      `Please find attached our ${what} ${ref}${d.kind === 'quotation' && d.validUntil ? `, valid until ${fmtDateDMY(d.validUntil)}` : ''}.`,
      'We are happy to answer any questions.',
      '',
      'Best regards,',
      [d.sender, d.brandName].filter(Boolean).join(' — '),
    ].join('\n'),
  }
}

/** WhatsApp link (wa.me needs the number with country code, digits only). */
export function whatsappUrl(phone: string | null | undefined, text: string) {
  let n = (phone ?? '').replace(/[^\d+]/g, '')
  if (n.startsWith('+')) n = n.slice(1)
  else if (n.startsWith('00')) n = n.slice(2)
  else if (/^01\d{9}$/.test(n)) n = `20${n.slice(1)}` // Egyptian mobile written locally
  return `https://wa.me/${/^\d{8,15}$/.test(n) ? n : ''}?text=${encodeURIComponent(text)}`
}
export const hasWhatsappNumber = (phone: string | null | undefined) => /^\+?\d{8,15}$/.test((phone ?? '').replace(/[\s()-]/g, '').replace(/^00/, '+'))

export function mailtoUrl(email: string | null | undefined, subject: string, body: string) {
  return `mailto:${(email ?? '').trim().replace(/[?&\s,;]/g, '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
