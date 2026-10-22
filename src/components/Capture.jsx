import { useEffect, useRef, useState } from 'react'

// Take a photo with the camera (phones: the back camera) or pick an image file.
// Without camera access (denied, none, or an insecure page) only the upload is offered.
export default function Capture({ onImage, disabled = false }) {
  const video = useRef(null)
  const file = useRef(null)
  const [stream, setStream] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const cameraSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream
    return undefined
  }, [stream])

  // Stop the camera when the component goes away.
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])

  const openCamera = async () => {
    setCameraError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      setStream(s)
    } catch (error) {
      setCameraError(
        error?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow it in your browser settings, or upload a photo instead.'
          : 'No camera is available. Upload a photo of the bill instead.',
      )
    }
  }

  const closeCamera = () => {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
  }

  const snap = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0)
    canvas.toBlob((blob) => {
      closeCamera()
      if (blob) onImage(blob)
    }, 'image/jpeg', 0.92)
  }

  if (stream) {
    return (
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
          <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={closeCamera} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={snap} className="btn-primary">
            Capture
          </button>
        </div>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">Fit the whole bill inside the frame, in good light.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {cameraSupported && (
        <button type="button" onClick={openCamera} disabled={disabled} className="btn-primary">
          <span aria-hidden="true">📷</span> Scan with camera
        </button>
      )}
      <button type="button" onClick={() => file.current?.click()} disabled={disabled} className="btn-secondary">
        <span aria-hidden="true">🖼️</span> Upload a photo
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        aria-label="Bill photo"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          e.target.value = ''
          if (picked) onImage(picked)
        }}
      />
      {cameraError && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {cameraError}
        </p>
      )}
    </div>
  )
}
