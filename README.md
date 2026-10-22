# BillCheck by DoAide

**Free receipt and bill scanner that checks the arithmetic and the GST.** Take a photo of a
restaurant bill, shop receipt or invoice, and BillCheck verifies:

- every line: quantity × price = amount
- the items add up to the subtotal
- CGST, SGST, UTGST and IGST use a real GST slab (5, 12, 18 or 28%; CGST/SGST at half each) and
  the tax amount matches the rate
- CGST and SGST are charged at the same rate
- subtotal − discount + tax ± round-off = total (an unprinted round-off to the rupee is accepted)

Correct lines get a green check, errors a red flag with the expected and printed amounts, and
lines it could not read are marked amber. OCR misreads a digit now and then, so every number is
editable and the checks re-run as you type.

Live at https://billcheck.doaide.com (no login).

## Privacy

Everything runs in the browser. The photo is read with [Tesseract.js](https://tesseract.projectnaptha.com/)
on the device and is never uploaded. The OCR engine and its English model are downloaded once
(about 10 MB) from the jsDelivr CDN and cached by the browser.

## Run it

```bash
npm install
npm run dev     # local dev server
npm test        # parser, validator and UI tests (Vitest)
npm run build   # static site in dist/
```

`dist/` is a static site: serve it from any static host.

## How it works

| File | What it does |
| --- | --- |
| `src/lib/ocr.js` | Grayscale + contrast + upscale the photo, then Tesseract.js OCR (loaded on first scan) |
| `src/lib/parse.js` | OCR text → line items (qty, price, amount), subtotal, taxes, discount, round-off, total |
| `src/lib/validate.js` | The checks, each `ok` / `error` / `unknown` with a plain-language message |
| `src/components/Capture.jsx` | Camera capture (`getUserMedia`, back camera) with upload as the fallback |
| `src/components/Results.jsx` | Summary banner, items and totals with their checks, editable values |

Stack: React 18, Vite 5, Tailwind CSS 3.4, Tesseract.js 5.
