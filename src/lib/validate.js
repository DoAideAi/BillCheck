// Checks a parsed receipt's arithmetic: each line, the subtotal, GST, and the total.
//
// Every check is { id, label, status, message }: status "ok" (green), "error" (red flag) or
// "unknown" (amber: not enough was read to check it).

export const GST_SLABS = [5, 12, 18, 28]
// Paise: a line or tax amount may be off by a rounding of the last digit.
const TOLERANCE = 0.011

const money = (n) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '–'
    : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const round2 = (n) => Math.round(n * 100) / 100
const close = (a, b, tolerance = TOLERANCE) => Math.abs(a - b) <= tolerance
// Bills often round a line or the total to the rupee.
const closeOrRounded = (expected, found) => close(expected, found) || (Number.isInteger(found) && Math.round(expected) === found)

const has = (n) => typeof n === 'number' && !Number.isNaN(n)

// CGST, SGST and UTGST are half of the GST rate each; IGST and plain GST are the whole rate.
export function isHalfRate(kind) {
  return kind === 'CGST' || kind === 'SGST' || kind === 'UTGST'
}

export function slabFor(kind, rate) {
  return isHalfRate(kind) ? rate * 2 : rate
}

export function checkItem(item) {
  const label = item.name || 'Item'
  if (!has(item.qty) || !has(item.price) || !has(item.total)) {
    if (has(item.total)) {
      return { id: item.id, label, status: 'unknown', message: `Amount ${money(item.total)}; quantity or price not read, so it can't be checked.` }
    }
    return { id: item.id, label, status: 'unknown', message: 'No amount read for this line.' }
  }
  const expected = round2(item.qty * item.price)
  if (closeOrRounded(expected, item.total)) {
    return { id: item.id, label, status: 'ok', message: `${item.qty} × ${money(item.price)} = ${money(item.total)}` }
  }
  return {
    id: item.id,
    label,
    status: 'error',
    message: `${item.qty} × ${money(item.price)} should be ${money(expected)}, but the bill says ${money(item.total)}.`,
    expected,
    found: item.total,
  }
}

export function itemsSum(items) {
  return round2(items.reduce((sum, i) => sum + (has(i.total) ? i.total : 0), 0))
}

function checkSubtotal(bill) {
  const sum = itemsSum(bill.items)
  if (!bill.items.length) return { id: 'subtotal', label: 'Subtotal', status: 'unknown', message: 'No line items were read.' }
  if (!has(bill.subtotal)) {
    return { id: 'subtotal', label: 'Subtotal', status: 'unknown', message: `No subtotal printed; the items add up to ${money(sum)}.` }
  }
  if (bill.items.some((i) => !has(i.total))) {
    return { id: 'subtotal', label: 'Subtotal', status: 'unknown', message: 'Some line amounts were not read, so the sum can’t be checked.' }
  }
  if (closeOrRounded(sum, bill.subtotal)) {
    return { id: 'subtotal', label: 'Subtotal', status: 'ok', message: `Items add up to ${money(bill.subtotal)}.` }
  }
  return {
    id: 'subtotal',
    label: 'Subtotal',
    status: 'error',
    message: `Items add up to ${money(sum)}, but the subtotal says ${money(bill.subtotal)} (off by ${money(round2(bill.subtotal - sum))}).`,
    expected: sum,
    found: bill.subtotal,
  }
}

// What tax is charged on: the subtotal (or the items' sum), possibly after the discount.
function taxBases(bill) {
  const base = has(bill.subtotal) ? bill.subtotal : bill.items.length ? itemsSum(bill.items) : null
  if (!has(base)) return []
  return has(bill.discount) && bill.discount > 0 ? [base, round2(base - bill.discount)] : [base]
}

export function checkTax(tax, bill) {
  const label = tax.rate !== null && tax.rate !== undefined ? `${tax.kind} @ ${tax.rate}%` : tax.kind
  const bases = taxBases(bill)
  if (tax.kind === 'VAT') {
    return { id: tax.id, label, status: 'unknown', message: 'VAT is not GST; its rate depends on the state, so it is not checked.' }
  }
  let rate = tax.rate
  let inferred = false
  if (!has(rate)) {
    if (!bases.length || !bases[0]) {
      return { id: tax.id, label, status: 'unknown', message: 'No rate printed and no subtotal to work it out from.' }
    }
    rate = round2((tax.amount / bases[0]) * 100)
    inferred = true
  }
  const slab = slabFor(tax.kind, rate)
  const slabOk = GST_SLABS.some((s) => close(s, slab, inferred ? 0.06 : 0.001))
  if (!slabOk) {
    const valid = isHalfRate(tax.kind) ? GST_SLABS.map((s) => `${s / 2}%`).join(', ') : GST_SLABS.map((s) => `${s}%`).join(', ')
    return {
      id: tax.id,
      label,
      status: 'error',
      message: inferred
        ? `${money(tax.amount)} is ${rate}% of ${money(bases[0])}, which is not a GST rate (${tax.kind} is ${valid}).`
        : `${rate}% is not a valid ${tax.kind} rate (${valid}).`,
    }
  }
  if (inferred) {
    const nearest = GST_SLABS.find((s) => close(s, slab, 0.06))
    const shown = isHalfRate(tax.kind) ? nearest / 2 : nearest
    return { id: tax.id, label: `${tax.kind} ≈ ${shown}%`, status: 'ok', message: `${money(tax.amount)} matches a ${nearest}% GST slab.` }
  }
  if (!bases.length) {
    return { id: tax.id, label, status: 'unknown', message: `${rate}% is a valid rate, but there is no subtotal to check the amount against.` }
  }
  const options = bases.map((b) => round2((b * rate) / 100))
  if (options.some((e) => close(e, tax.amount, 0.02))) {
    return { id: tax.id, label, status: 'ok', message: `${rate}% of the taxable amount is ${money(tax.amount)}.` }
  }
  return {
    id: tax.id,
    label,
    status: 'error',
    message: `${rate}% of ${money(bases[bases.length - 1])} is ${money(options[options.length - 1])}, but the bill charges ${money(tax.amount)}.`,
    expected: options[options.length - 1],
    found: tax.amount,
  }
}

// CGST and SGST are always charged at the same rate.
function checkTaxPair(bill) {
  const rate = (kind) => bill.taxes.filter((t) => t.kind === kind && has(t.rate)).map((t) => t.rate)
  const cgst = rate('CGST')
  const sgst = [...rate('SGST'), ...rate('UTGST')]
  if (!cgst.length || !sgst.length) return null
  const same = cgst.length === sgst.length && cgst.every((r, i) => r === sgst[i])
  return same
    ? { id: 'tax-pair', label: 'CGST = SGST', status: 'ok', message: 'Central and state GST are charged at the same rate.' }
    : { id: 'tax-pair', label: 'CGST = SGST', status: 'error', message: `CGST (${cgst.join(', ')}%) and SGST (${sgst.join(', ')}%) should be equal.` }
}

function checkTotal(bill) {
  if (!has(bill.total)) return { id: 'total', label: 'Total', status: 'unknown', message: 'No total was read.' }
  const base = has(bill.subtotal) ? bill.subtotal : bill.items.length ? itemsSum(bill.items) : null
  if (!has(base)) return { id: 'total', label: 'Total', status: 'unknown', message: 'Nothing to add up the total from.' }
  const tax = bill.taxes.reduce((s, t) => s + (has(t.amount) ? t.amount : 0), 0)
  const discount = has(bill.discount) ? bill.discount : 0
  const roundOff = has(bill.roundOff) ? bill.roundOff : 0
  const expected = round2(base - discount + tax + roundOff)
  const parts = [`${money(base)} subtotal`]
  if (discount) parts.push(`− ${money(discount)} discount`)
  if (tax) parts.push(`+ ${money(round2(tax))} tax`)
  if (roundOff) parts.push(`${roundOff < 0 ? '−' : '+'} ${money(Math.abs(roundOff))} round-off`)
  if (close(expected, bill.total)) {
    return { id: 'total', label: 'Total', status: 'ok', message: `${parts.join(' ')} = ${money(bill.total)}` }
  }
  // An unprinted round-off to the nearest rupee.
  if (!roundOff && Number.isInteger(bill.total) && Math.abs(expected - bill.total) <= 0.5) {
    return { id: 'total', label: 'Total', status: 'ok', message: `${parts.join(' ')} = ${money(expected)}, rounded to ${money(bill.total)}.` }
  }
  return {
    id: 'total',
    label: 'Total',
    status: 'error',
    message: `${parts.join(' ')} = ${money(expected)}, but the bill says ${money(bill.total)} (off by ${money(round2(bill.total - expected))}).`,
    expected,
    found: bill.total,
  }
}

export function validateReceipt(bill) {
  const items = bill.items.map(checkItem)
  const summary = [checkSubtotal(bill), ...bill.taxes.map((t) => checkTax(t, bill))]
  const pair = checkTaxPair(bill)
  if (pair) summary.push(pair)
  summary.push(checkTotal(bill))
  const all = [...items, ...summary]
  return {
    items,
    summary,
    errors: all.filter((c) => c.status === 'error').length,
    unknown: all.filter((c) => c.status === 'unknown').length,
    ok: all.filter((c) => c.status === 'ok').length,
  }
}
