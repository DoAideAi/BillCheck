import { describe, expect, it } from 'vitest'
import { parseReceipt } from './parse.js'
import { checkItem, checkTax, validateReceipt } from './validate.js'

const item = (qty, price, total) => ({ id: 'i', name: 'Dosa', qty, price, total })
const statusOf = (result, id) => [...result.items, ...result.summary].find((c) => c.id === id)?.status

describe('line items', () => {
  it('passes qty × price = total, flags a wrong total, and is unsure without a price', () => {
    expect(checkItem(item(2, 45, 90)).status).toBe('ok')
    expect(checkItem(item(3, 33.33, 100)).status).toBe('ok') // rounded to the rupee
    const wrong = checkItem(item(2, 45, 95))
    expect(wrong).toMatchObject({ status: 'error', expected: 90, found: 95 })
    expect(wrong.message).toContain('should be ₹90.00')
    expect(checkItem(item(2, null, 90)).status).toBe('unknown')
  })
})

describe('whole bills', () => {
  it('passes a correct bill with CGST + SGST 9 + 9', () => {
    const r = validateReceipt(
      parseReceipt('Pizza 1 400.00 400.00\nCoke 2 x 50.00 100.00\nSubtotal 500.00\nCGST 9% 45.00\nSGST 9% 45.00\nTotal 590.00'),
    )
    expect(r.errors).toBe(0)
    expect(r.summary.map((c) => c.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
  })

  it('passes GST at the 18% slab, IGST', () => {
    const r = validateReceipt(parseReceipt('Shirt 1 1000.00 1000.00\nSubtotal 1000.00\nIGST @ 18% 180.00\nTotal 1180.00'))
    expect(r.errors).toBe(0)
  })

  it('flags a subtotal that does not match the items', () => {
    const r = validateReceipt(parseReceipt('Tea 2 x 20.00 40.00\nBun 1 x 30.00 30.00\nSubtotal 80.00\nTotal 80.00'))
    expect(statusOf(r, 'subtotal')).toBe('error')
    expect(r.summary[0].message).toContain('off by ₹10.00')
  })

  it('flags a GST rate that is not a slab, and an unequal CGST/SGST pair', () => {
    const r = validateReceipt(parseReceipt('Item 1 100.00 100.00\nSubtotal 100.00\nCGST 10% 10.00\nSGST 9% 9.00\nTotal 119.00'))
    const [, cgst, sgst, pair] = r.summary
    expect(cgst.status).toBe('error')
    expect(cgst.message).toContain('not a valid CGST rate')
    expect(sgst.status).toBe('ok')
    expect(pair.status).toBe('error')
  })

  it('flags a GST amount that does not match the rate', () => {
    const bill = parseReceipt('Item 1 100.00 100.00\nSubtotal 100.00\nGST 18% 20.00\nTotal 120.00')
    const r = validateReceipt(bill)
    expect(r.summary[1]).toMatchObject({ status: 'error', expected: 18, found: 20 })
  })

  it('works out a missing rate from the amount', () => {
    const bill = { items: [], subtotal: 200, discount: null, taxes: [{ id: 't', kind: 'CGST', rate: null, amount: 12 }] }
    expect(checkTax(bill.taxes[0], bill)).toMatchObject({ status: 'ok', label: 'CGST ≈ 6%' })
    const odd = { ...bill, taxes: [{ id: 't', kind: 'GST', rate: null, amount: 20 }] }
    expect(checkTax(odd.taxes[0], odd).status).toBe('error')
  })

  it('accepts a total with a printed or unprinted round-off, and tax after a discount', () => {
    const printed = validateReceipt(
      parseReceipt('Shoes 1 1000.00 1000.00\nDiscount 100.00\nIGST 18% 162.00\nRound off -0.40\nTotal 1061.60'),
    )
    expect(printed.errors).toBe(0)
    const rounded = validateReceipt(parseReceipt('Rice 1 99.60 99.60\nSubtotal 99.60\nTotal 100'))
    expect(statusOf(rounded, 'total')).toBe('ok')
    const wrong = validateReceipt(parseReceipt('Rice 1 100.00 100.00\nSubtotal 100.00\nTotal 110.00'))
    expect(statusOf(wrong, 'total')).toBe('error')
  })

  it('is unsure, not wrong, when nothing was read', () => {
    const r = validateReceipt(parseReceipt('blurry nonsense'))
    expect(r.errors).toBe(0)
    expect(r.unknown).toBeGreaterThan(0)
  })
})
