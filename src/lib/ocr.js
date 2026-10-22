// In-browser OCR with Tesseract.js: the image never leaves the device. The recognition engine
// and the English model are downloaded once (and cached by the browser) the first time.
import { createWorker } from 'tesseract.js'

let workerPromise = null
let onProgress = () => {}

function worker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress({ stage: 'Reading the bill', progress: m.progress })
        else if (m.status) onProgress({ stage: 'Preparing the scanner', progress: m.progress ?? 0 })
      },
    }).catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

// Grayscale, stretch the contrast and scale small photos up: Tesseract reads receipts' thin
// thermal print much better that way.
export async function prepare(blob) {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(3, Math.max(1, 1600 / Math.max(bitmap.width, bitmap.height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = image.data
  let min = 255
  let max = 0
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    px[i] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let i = 0; i < px.length; i += 4) {
    const v = ((px[i] - min) / range) * 255
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export async function recognize(blob, progress = () => {}) {
  onProgress = progress
  progress({ stage: 'Preparing the scanner', progress: 0 })
  const [w, canvas] = await Promise.all([worker(), prepare(blob)])
  const { data } = await w.recognize(canvas)
  progress({ stage: 'Done', progress: 1 })
  return data.text
}
