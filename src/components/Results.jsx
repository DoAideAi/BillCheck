import { validateReceipt } from '../lib/validate.js'

const ICON = { ok: '✓', error: '!', unknown: '?' }
const TONE = {
  ok: 'bg-emerald-500 text-white',
  error: 'bg-red-500 text-white',
  unknown: 'bg-amber-400 text-amber-950',
}
const TEXT = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  error: 'text-red-700 dark:text-red-300',
  unknown: 'text-amber-700 dark:text-amber-300',
}
const WORD = { ok: 'Correct', error: 'Error', unknown: 'Not checked' }

function Mark({ status }) {
  return (
    <span
      role="img"
      aria-label={WORD[status]}
      data-status={status}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${TONE[status]}`}
    >
      {ICON[status]}
    </span>
  )
}

// A number field: empty means "not read".
function Amount({ label, value, onChange, wide = false }) {
  return (
    <label className={`flex flex-col gap-0.5 ${wide ? 'flex-1' : 'w-20'}`}>
      <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  )
}

function Check({ check }) {
  return (
    <div className="flex items-start gap-3">
      <Mark status={check.status} />
      <div className="min-w-0">
        <div className="font-medium text-slate-900 dark:text-slate-100">{check.label}</div>
        <p className={`text-sm ${TEXT[check.status]}`}>{check.message}</p>
      </div>
    </div>
  )
}

export function Summary({ result }) {
  const { errors, unknown } = result
  const tone = errors ? 'error' : unknown ? 'unknown' : 'ok'
  const title = errors
    ? `${errors} problem${errors === 1 ? '' : 's'} found`
    : unknown
      ? 'No errors found, but some lines could not be checked'
      : 'All checks passed'
  const bg = {
    ok: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30',
    error: 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30',
    unknown: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30',
  }[tone]
  return (
    <div data-testid="summary" role="status" className={`flex items-center gap-3 rounded-2xl border p-4 ${bg}`}>
      <Mark status={tone} />
      <div>
        <div className={`text-lg font-semibold ${TEXT[tone]}`}>{title}</div>
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {result.ok} correct · {errors} wrong · {unknown} not checked. Fix any misread number below to re-check.
        </div>
      </div>
    </div>
  )
}

// The parsed bill with every check, editable: OCR misreads a digit now and then, and changing a
// number re-runs the checks at once.
export default function Results({ bill, onChange, text }) {
  const result = validateReceipt(bill)
  const byId = Object.fromEntries([...result.items, ...result.summary].map((c) => [c.id, c]))
  const setItem = (id, field, value) => onChange({ ...bill, items: bill.items.map((i) => (i.id === id ? { ...i, [field]: value } : i)) })
  const setTax = (id, field, value) => onChange({ ...bill, taxes: bill.taxes.map((t) => (t.id === id ? { ...t, [field]: value } : t)) })
  const set = (field, value) => onChange({ ...bill, [field]: value })
  const removeItem = (id) => onChange({ ...bill, items: bill.items.filter((i) => i.id !== id) })

  return (
    <div className="flex flex-col gap-5">
      <Summary result={result} />

      <section className="card">
        <h2 className="section-title">Items ({bill.items.length})</h2>
        {bill.items.length === 0 && <p className="text-sm text-slate-500">No line items were read. Try a sharper photo.</p>}
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {bill.items.map((item) => (
            <li key={item.id} data-testid="item" className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <Check check={byId[item.id]} />
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeItem(item.id)}
                  className="h-9 w-9 shrink-0 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  ×
                </button>
              </div>
              <div className="flex items-end gap-2 pl-10">
                <Amount label="Qty" value={item.qty} onChange={(v) => setItem(item.id, 'qty', v)} />
                <Amount label="Price" value={item.price} onChange={(v) => setItem(item.id, 'price', v)} wide />
                <Amount label="Amount" value={item.total} onChange={(v) => setItem(item.id, 'total', v)} wide />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="section-title">Totals and GST</h2>
        <Check check={byId.subtotal} />
        <div className="pl-10">
          <Amount label="Subtotal" value={bill.subtotal} onChange={(v) => set('subtotal', v)} wide />
        </div>
        {bill.discount !== null && (
          <div className="pl-10">
            <Amount label="Discount" value={bill.discount} onChange={(v) => set('discount', v)} wide />
          </div>
        )}
        {bill.taxes.map((tax) => (
          <div key={tax.id} className="flex flex-col gap-2">
            <Check check={byId[tax.id]} />
            <div className="flex items-end gap-2 pl-10">
              <Amount label="Rate %" value={tax.rate} onChange={(v) => setTax(tax.id, 'rate', v)} />
              <Amount label={`${tax.kind} amount`} value={tax.amount} onChange={(v) => setTax(tax.id, 'amount', v)} wide />
            </div>
          </div>
        ))}
        {bill.taxes.length === 0 && <p className="pl-10 text-sm text-slate-500">No GST lines were found on this bill.</p>}
        {byId['tax-pair'] && <Check check={byId['tax-pair']} />}
        <Check check={byId.total} />
        <div className="flex items-end gap-2 pl-10">
          {bill.roundOff !== null && <Amount label="Round off" value={bill.roundOff} onChange={(v) => set('roundOff', v)} />}
          <Amount label="Total" value={bill.total} onChange={(v) => set('total', v)} wide />
        </div>
      </section>

      {text && (
        <details className="card text-sm">
          <summary className="cursor-pointer select-none font-medium text-slate-700 dark:text-slate-300">Text read from the photo</summary>
          <pre data-testid="ocr-text" className="mt-3 whitespace-pre-wrap break-words font-mono text-xs text-slate-600 dark:text-slate-400">
            {text}
          </pre>
        </details>
      )}
    </div>
  )
}
