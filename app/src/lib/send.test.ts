import { describe, expect, it } from 'vitest'
import { mailtoUrl, sendMessage, whatsappUrl } from './send'

describe('send', () => {
  it('builds English and Arabic messages', () => {
    const en = sendMessage({ kind: 'quotation', number: 'Q-26-001', version: 2, contactName: 'John', validUntil: '2026-11-30', sender: 'Haddeer', brandName: 'MS El-brancy Group' })
    expect(en.subject).toBe('Quotation Q-26-001 rev. 2 — MS El-brancy Group')
    expect(en.body).toContain('Dear John,')
    expect(en.body).toContain('valid until 30/11/2026')
    expect(en.body.endsWith('Haddeer — MS El-brancy Group')).toBe(true)
    const ar = sendMessage({ kind: 'proforma', number: 'PI-1', lang: 'ar', brandName: 'Prime Roots' })
    expect(ar.body.startsWith('السادة الكرام')).toBe(true)
    expect(ar.subject).toContain('PI-1')
  })
  it('WhatsApp numbers', () => {
    expect(whatsappUrl('+971 50 123 4567', 'hi')).toBe('https://wa.me/971501234567?text=hi')
    expect(whatsappUrl('0044 7700 900123', 'a b')).toBe('https://wa.me/447700900123?text=a%20b')
    expect(whatsappUrl('01012345678', 'x')).toBe('https://wa.me/201012345678?text=x')
    expect(whatsappUrl('', 'x')).toBe('https://wa.me/?text=x')
  })
  it('mailto', () => {
    expect(mailtoUrl('a@b.com', 'S 1', 'L1\nL2')).toBe('mailto:a@b.com?subject=S%201&body=L1%0AL2')
  })
})
