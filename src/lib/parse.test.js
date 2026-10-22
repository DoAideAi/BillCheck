import { describe, expect, it } from 'vitest'
import { numbersIn, parseReceipt, toNumber } from './parse.js'

describe('toNumber', () => {
  it('reads noisy OCR numbers', () => {
    expect(toNumber('Rs. 1,234.50')).toBe(1234.5)
    expect(toNumber('₹90.OO')).toBe(90)
    expect(toNumber('1O5.5O')).toBe(105.5)
    expect(toNumber('1,00,000.00')).toBe(100000)
    expect(toNumber('l2')).toBe(12)
    expect(toNumber('abc')).toBeNull()
  })

  it('skips numbers inside words and units', () => {
    expect(numbersIn('7UP 500ml 2 x 20.00 40.00').found.map((n) => n.value)).toEqual([2, 20, 40])
  })
})

describe('parseReceipt', () => {
  const RECEIPT = `
    HOTEL SARAVANA BHAVAN
    GSTIN: 33AAAAA0000A1Z5
    Date: 12/10/2026  Bill No: 4521
    Item            Qty  Rate   Amount
    Masala Dosa      2 x 90.00  180.00
    Filter Coffee    3   30.00   90.00
    Rs. Water Bottle 1  ₹20.OO  ₹20.00
    Total items: 3
    Sub Total                  290.00
    CGST @ 2.5%                  7.25
    SGST @ 2.5%                  7.25
    Round off                   +0.50
    Grand Total            Rs. 305.00
    Thank you, visit again`

  it('finds the items, summary lines and ignores the rest', () => {
    const bill = parseReceipt(RECEIPT)
    expect(bill.items.map((i) => [i.name, i.qty, i.price, i.total])).toEqual([
      ['Masala Dosa', 2, 90, 180],
      ['Filter Coffee', 3, 30, 90],
      ['Water Bottle', 1, 20, 20],
    ])
    expect(bill.subtotal).toBe(290)
    expect(bill.taxes.map((t) => [t.kind, t.rate, t.amount])).toEqual([
      ['CGST', 2.5, 7.25],
      ['SGST', 2.5, 7.25],
    ])
    expect(bill.roundOff).toBe(0.5)
    expect(bill.total).toBe(305)
    expect(bill.ignored.some((l) => l.startsWith('GSTIN'))).toBe(true)
    expect(bill.ignored).toContain('Total items: 3')
  })

  it('reads two-number and one-number item lines', () => {
    const bill = parseReceipt('Tea 2 40.00\nSamosa 15.00 30.00\nParcel charge 10.00')
    expect(bill.items.map((i) => [i.qty, i.price, i.total])).toEqual([
      [2, null, 40],
      [null, 15, 30],
      [null, null, 10],
    ])
  })

  it('reads IGST, discounts, negative round-off and a Total GST line', () => {
    const bill = parseReceipt('Shoes 1 1000.00 1000.00\nDiscount 100.00\nIGST 18% 162.00\nRound off -0.40\nTotal 1061.60')
    expect(bill.discount).toBe(100)
    expect(bill.taxes[0]).toMatchObject({ kind: 'IGST', rate: 18, amount: 162 })
    expect(bill.roundOff).toBe(-0.4)
    expect(bill.total).toBe(1061.6)
    const summed = parseReceipt('Pen 2 x 50.00 100.00\nTotal GST 18% 18.00\nTotal 118.00')
    expect(summed.taxes).toHaveLength(1)
    expect(summed.taxes[0]).toMatchObject({ kind: 'GST', rate: 18, amount: 18 })
    expect(summed.total).toBe(118)
  })
})
