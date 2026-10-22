import { useEffect, useState } from 'react'
import Capture from './components/Capture.jsx'
import Results from './components/Results.jsx'
import { parseReceipt } from './lib/parse.js'

// A restaurant bill with one deliberate mistake (the coffee line), for trying BillCheck
// without a photo.
export const SAMPLE = `CAFE MADRAS
GSTIN: 27AAAAA0000A1Z5
Bill No: 1042   Date: 21/10/2026
Masala Dosa      2 x 120.00   240.00
Filter Coffee    3 x  40.00   130.00
Idli Vada        1 x  90.00    90.00
Sub Total                     460.00
CGST @ 2.5%                    11.50
SGST @ 2.5%                    11.50
Grand Total                   483.00`

export default function App({ recognize = null }) {
  const [phase, setPhase] = useState('start') // start | reading | done | failed
  const [progress, setProgress] = useState({ stage: '', progress: 0 })
  const [text, setText] = useState('')
  const [bill, setBill] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const show = (ocrText) => {
    setText(ocrText)
    setBill(parseReceipt(ocrText))
    setPhase('done')
  }

  const scan = async (blob) => {
    setPreview(URL.createObjectURL(blob))
    setPhase('reading')
    setError(null)
    try {
      // Loaded on first use: the OCR engine is the bulk of the download.
      const read = recognize ?? (await import('./lib/ocr.js')).recognize
      show(await read(blob, setProgress))
    } catch (e) {
      setError(e?.message || 'The photo could not be read.')
      setPhase('failed')
    }
  }

  const reset = () => {
    setPhase('start')
    setBill(null)
    setText('')
    setPreview(null)
    setError(null)
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={reset} className="flex items-center gap-2 text-left" aria-label="BillCheck home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-lg font-bold text-white">
              ✓
            </span>
            <span className="leading-tight">
              <span className="block text-base font-semibold text-slate-900 dark:text-white">BillCheck</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">by DoAide</span>
            </span>
          </button>
          {phase !== 'start' && (
            <button type="button" onClick={reset} className="rounded-full px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10">
              New scan
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6">
        {phase === 'start' && (
          <>
            <section className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Check your bill in seconds</h1>
              <p className="text-slate-600 dark:text-slate-400">
                Scan a receipt and BillCheck verifies every line (quantity × price), the subtotal, GST at the 5, 12, 18 and
                28% slabs, and the total. Free, no sign-up, and your photo never leaves your phone.
              </p>
            </section>
            <Capture onImage={scan} />
            <button type="button" onClick={() => show(SAMPLE)} className="text-sm font-medium text-sky-700 underline-offset-4 hover:underline dark:text-sky-300">
              No bill handy? Try a sample
            </button>
            <section className="card text-sm text-slate-600 dark:text-slate-400">
              <h2 className="section-title">What gets checked</h2>
              <ul className="flex flex-col gap-1.5">
                <li>✓ Each item: quantity × price = amount</li>
                <li>✓ Items add up to the subtotal</li>
                <li>✓ CGST, SGST and IGST use a real GST slab, and the amount matches</li>
                <li>✓ Subtotal − discount + tax ± round-off = total</li>
              </ul>
            </section>
          </>
        )}

        {phase === 'reading' && (
          <section data-testid="reading" className="card flex flex-col items-center gap-4 py-8 text-center">
            {preview && <img src={preview} alt="Your bill" className="max-h-56 rounded-lg object-contain" />}
            <div className="w-full">
              <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{progress.stage || 'Starting'}…</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progress * 100)}>
                <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
              <p className="mt-3 text-xs text-slate-500">The first scan downloads the text reader (about 10 MB); later scans are faster.</p>
            </div>
          </section>
        )}

        {phase === 'failed' && (
          <section role="alert" className="card flex flex-col gap-3">
            <p className="font-medium text-red-700 dark:text-red-300">Couldn’t read that photo.</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
            <button type="button" onClick={reset} className="btn-primary">
              Try again
            </button>
          </section>
        )}

        {phase === 'done' && bill && <Results bill={bill} onChange={setBill} text={text} />}
      </main>

      <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        BillCheck is a free tool by{' '}
        <a href="https://doaide.com" className="font-medium text-sky-700 hover:underline dark:text-sky-300">
          DoAide
        </a>
        . Everything runs in your browser.
      </footer>
    </div>
  )
}
