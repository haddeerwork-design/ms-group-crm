import { describe, expect, it } from 'vitest'
import { daysToDeparture, docChecklist } from './orders'

describe('shipment documents', () => {
  it('uploaded = ready, waived = not needed, the rest missing', () => {
    const c = docChecklist([{ doc_type: 'commercial_invoice' }, { doc_type: 'packing_list' }, { doc_type: 'other' }], ['health_certificate'])
    expect([c.ready, c.needed]).toEqual([2, 6])
    expect(c.missing).toEqual(['phytosanitary', 'certificate_of_origin', 'bl_awb', 'quality_certificate'])
  })
  it('an uploaded document counts even if it was marked not needed', () => {
    expect(docChecklist([{ doc_type: 'bl_awb' }], ['bl_awb']).items.find((i) => i.type === 'bl_awb')!.state).toBe('ready')
  })
  it('days to departure only before shipping', () => {
    expect(daysToDeparture({ stage: 'booked', departure_date: '2026-11-15' }, '2026-11-11')).toBe(4)
    expect(daysToDeparture({ stage: 'shipped', departure_date: '2026-11-15' }, '2026-11-11')).toBeNull()
    expect(daysToDeparture({ stage: 'packing', departure_date: null }, '2026-11-11')).toBeNull()
  })
})
