'use client'

import { useEffect, useRef, useState } from 'react'
import type { ImageSegmenter as ImageSegmenterType } from '@mediapipe/tasks-vision'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

// Real-time portrait mode: person stays sharp, background gets blurred.
// Renders the processed result onto a canvas that overlays the <video>.
export function useBackgroundBlur({
  videoRef,
  enabled,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  enabled: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const segmenterRef = useRef<ImageSegmenterType | null>(null)
  const rafRef = useRef<number>(0)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)

  // Lazy-load the segmenter the first time blur is enabled
  useEffect(() => {
    if (!enabled || segmenterRef.current) return
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision')
        let lastError: unknown
        for (const source of [
          { wasm: '/mediapipe/wasm', model: '/mediapipe/selfie_segmenter.tflite' },
          { wasm: WASM_URL, model: MODEL_URL },
        ]) {
          if (cancelled) return
          try {
            const fileset = await FilesetResolver.forVisionTasks(source.wasm)
            for (const delegate of ['GPU', 'CPU'] as const) {
              if (cancelled) return
              try {
                const segmenter = await ImageSegmenter.createFromOptions(fileset, {
                  baseOptions: { modelAssetPath: source.model, delegate },
                  runningMode: 'VIDEO',
                  outputConfidenceMasks: true,
                })
                if (cancelled) {
                  segmenter.close()
                  return
                }
                segmenterRef.current = segmenter
                setReady(true)
                return
              } catch (err) {
                lastError = err
                console.log('[v0] Segmenter delegate failed:', source.wasm, delegate, err)
              }
            }
          } catch (err) {
            lastError = err
            console.log('[v0] Segmenter fileset failed:', source.wasm, err)
          }
        }
        throw lastError
      } catch (err) {
        console.log('[v0] Segmenter load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    return () => {
      segmenterRef.current?.close()
      segmenterRef.current = null
    }
  }, [])

  // Render loop
  useEffect(() => {
    if (!enabled || !ready) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const segmenter = segmenterRef.current
    if (!video || !canvas || !segmenter) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Offscreen canvases reused across frames
    const maskCanvas = document.createElement('canvas')
    const maskCtx = maskCanvas.getContext('2d')
    const personCanvas = document.createElement('canvas')
    const personCtx = personCanvas.getContext('2d')
    if (!maskCtx || !personCtx) return

    let lastVideoTime = -1
    let running = true

    function render() {
      if (!running) return
      rafRef.current = requestAnimationFrame(render)
      if (!video || video.videoWidth === 0 || !segmenter || !ctx || !maskCtx || !personCtx) return
      if (video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime

      const w = video.videoWidth
      const h = video.videoHeight
      if (canvas && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w
        canvas.height = h
        personCanvas.width = w
        personCanvas.height = h
      }

      let result
      try {
        result = segmenter.segmentForVideo(video, performance.now())
      } catch {
        return
      }
      const mask = result?.confidenceMasks?.[0]
      if (!mask) {
        result?.close()
        return
      }

      const mw = mask.width
      const mh = mask.height
      if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
        maskCanvas.width = mw
        maskCanvas.height = mh
      }

      // Build alpha mask (person = opaque)
      const maskData = mask.getAsFloat32Array()
      const imageData = maskCtx.createImageData(mw, mh)
      for (let i = 0; i < maskData.length; i++) {
        const alpha = Math.round(maskData[i] * 255)
        imageData.data[i * 4 + 3] = alpha
      }
      maskCtx.putImageData(imageData, 0, 0)
      result.close()

      // Person layer: sharp frame masked to the person
      personCtx.clearRect(0, 0, w, h)
      personCtx.drawImage(video, 0, 0, w, h)
      personCtx.globalCompositeOperation = 'destination-in'
      personCtx.drawImage(maskCanvas, 0, 0, w, h)
      personCtx.globalCompositeOperation = 'source-over'

      // Final: blurred background + sharp person
      ctx.filter = 'blur(14px)'
      ctx.drawImage(video, 0, 0, w, h)
      ctx.filter = 'none'
      ctx.drawImage(personCanvas, 0, 0, w, h)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, ready, videoRef])

  return { canvasRef, blurReady: enabled && ready, blurLoading: loading }
}
