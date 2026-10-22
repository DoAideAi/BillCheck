// Turns OCR text from a receipt into line items and the bill's summary lines.
//
// Receipts differ a lot, so this is a heuristic: a line's trailing numbers are its quantity,
// unit price and amount; a keyword (Subtotal, CGST, Total…) marks a summary line instead.
// OCR noise is tolerated: currency prefixes (₹, Rs., INR), thousands separators, and the
// letters O/o, l/I read in place of 0 and 1 inside numbers.

// A number as printed: starts with a digit; O/o/l/I may stand in for digits after that.
// Not part of a word or a unit ("7UP", "500ml").
const NUMBER = /(?<![A-Za-z])\d[\dOoIl,]*(?:\.[\dOoIl]{1,2})?(?![\dA-Za-z])/g
const CURRENCY = /(?:₹|\brs\.?|\binr\b)\s*/gi
// "2 x 45.00", "2x45", "2 @ 45", "2 Nos 45": only between two numbers ("Wax 2" keeps its x).
const QTY_SEPARATOR = /(?<=\d)\s*(?:[x×*@]|nos?\.?|pcs?)\s*(?=\d)/gi

const SKIP = /\b(gstin|invoice|bill\s*no|receipt\s*no|date|time|phone|tel|mob(?:ile)?|cashier|table|thank|visit|fssai|hsn\s*code|order\s*no|token|customer)\b/i
const ROUND_OFF = /\b(round(?:ing)?[\s-]*off|rounding|r\/o)\b/i
const DISCOUNT = /\b(discount|disc\.?|less|savings?)\b/i
const SUBTOTAL = /\b(sub[\s-]*total|taxable(?:\s*(?:value|amount))?|net\s*taxable|gross\s*amount)\b/i
const TAX = /\b(c\s*gst|s\s*gst|i\s*gst|ut\s*gst|gst|vat)\b/i
const TOTAL = /\b(grand\s*total|net\s*(?:total|amount|payable)|total\s*(?:amount|payable|due)?|amount\s*(?:payable|due)|bill\s*amount|to\s*pay)\b/i
// "Total GST 90.00": the sum of the tax lines (used only when there are none).
const TAX_TOTAL = /\b(total\s*(?:c|s|i)?\s*gst|gst\s*total|total\s*tax)\b/i
// "Total items: 3", "Total qty 4": counts, not money.
const COUNT_LINE = /\btotal\s*(items?|qty|quantity|pcs|nos)\b/i

// "1,234.5O" -> 1234.5; null when it is not a number after cleanup.
export function toNumber(text) {
  if (text === null || text === undefined) return null
  const cleaned = String(text)
    .replace(CURRENCY, '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .trim()
  // "12,50" alone is a decimal comma; otherwise commas group digits (1,234.50 and 1,00,000).
  const number = /^\d+,\d{2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  if (!/^\d+(?:\.\d+)?$/.test(number)) return null
  return Number(number)
}

// The numbers on a line, in order, with where they start (so the item name can be cut off).
export function numbersIn(line) {
  const text = line.replace(CURRENCY, ' ').replace(QTY_SEPARATOR, ' ')
  const found = []
  for (const m of text.matchAll(NUMBER)) {
    const value = toNumber(m[0])
    if (value !== null) found.push({ value, index: m.index, raw: m[0], decimal: m[0].includes('.') })
  }
  return { text, found }
}

function lastAmount(found) {
  return found.length ? found[found.length - 1].value : null
}

function taxKind(match) {
  const k = match.replace(/\s+/g, '').toUpperCase()
  return k === 'VAT' ? 'VAT' : k
}

function parseTax(line) {
  const kind = taxKind(line.match(TAX)[1])
  const rateMatch = line.match(/(\d+(?:\.\d+)?)\s*%/)
  const rate = rateMatch ? Number(rateMatch[1]) : null
  // The amount: the last number that is not the rate itself.
  const { found } = numbersIn(line.replace(/(\d+(?:\.\d+)?)\s*%/, ' '))
  const amount = lastAmount(found)
  return amount === null ? null : { kind, rate, amount }
}

let nextId = 0
const id = (prefix) => `${prefix}-${++nextId}`

function parseItem(line) {
  const { text, found } = numbersIn(line)
  if (!found.length) return null
  // The name: what comes before the first of the trailing numbers (at most three of them).
  const tail = found.slice(-3)
  const name = text.slice(0, tail[0].index).replace(/[^\p{L}\p{N})\]]+$/u, '').trim()
  if (!/\p{L}{2,}/u.test(name)) return null
  // A bare integer at the end with no decimals is more likely a code than a price.
  if (tail.length === 1 && !tail[0].decimal && tail[0].value > 99999) return null
  const item = { id: id('item'), name, qty: null, price: null, total: null, raw: line.trim() }
  if (tail.length === 3) {
    ;[item.qty, item.price, item.total] = tail.map((n) => n.value)
  } else if (tail.length === 2) {
    const [a, b] = tail
    // "Tea 2 40.00": quantity and amount. "Tea 20.00 40.00": price and amount (quantity unknown).
    if (!a.decimal && a.value > 0 && a.value < 1000) {
      item.qty = a.value
      item.total = b.value
    } else {
      item.price = a.value
      item.total = b.value
    }
  } else {
    item.total = tail[0].value
  }
  return item
}

export function parseReceipt(text) {
  const result = {
    items: [],
    subtotal: null,
    taxes: [],
    taxTotal: null,
    discount: null,
    roundOff: null,
    total: null,
    ignored: [],
  }
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (COUNT_LINE.test(line)) {
      result.ignored.push(line)
      continue
    }
    const { found } = numbersIn(line)
    if (ROUND_OFF.test(line)) {
      const amount = lastAmount(found)
      if (amount !== null) result.roundOff = /-\s*[\d₹R]|\(\s*[\d₹R]|\bless\b/i.test(line) ? -amount : amount
      continue
    }
    if (SUBTOTAL.test(line)) {
      result.subtotal = lastAmount(found) ?? result.subtotal
      continue
    }
    if (TAX_TOTAL.test(line)) {
      result.taxTotal = parseTax(line.replace(TAX_TOTAL, 'GST'))
      continue
    }
    if (TAX.test(line) && !TOTAL.test(line.replace(TAX, ''))) {
      const tax = parseTax(line)
      if (tax) result.taxes.push({ id: id('tax'), ...tax, raw: line })
      else result.ignored.push(line)
      continue
    }
    if (DISCOUNT.test(line)) {
      const amount = lastAmount(found)
      if (amount !== null) result.discount = (result.discount ?? 0) + amount
      continue
    }
    if (TOTAL.test(line)) {
      // The last total on the bill is the one that is paid ("Total" then "Grand Total").
      const amount = lastAmount(found)
      if (amount !== null) result.total = amount
      continue
    }
    if (SKIP.test(line)) {
      result.ignored.push(line)
      continue
    }
    const item = parseItem(line)
    if (item) result.items.push(item)
    else result.ignored.push(line)
  }
  if (!result.taxes.length && result.taxTotal) result.taxes.push({ id: id('tax'), ...result.taxTotal, raw: 'Total GST' })
  return result
}
