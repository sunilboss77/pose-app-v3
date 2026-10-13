'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ChevronLeft,
  Timer,
  Grid3x3,
  SwitchCamera,
  Ban,
  Download,
  X,
  ImageIcon,
  Zap,
  ZapOff,
  Sun,
  Sparkles,
  Palette,
  Aperture,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Phone,
  PhoneOff,
  Loader2,
} from 'lucide-react'
import { CATEGORY_REFERENCE_PHOTOS, POSE_CATEGORIES, POSES, getPoseReferencePhoto } from '@/lib/poses'
import {
  CAMERA_FILTERS,
  applyColorMatrix,
  cssFilterToColorMatrix,
  getFilterById,
  supportsCanvasFilter,
} from '@/lib/filters'
import { useBackgroundBlur } from '@/hooks/use-background-blur'
import { useGeminiLive } from '@/hooks/use-gemini-live'
import type { AiCameraActions } from '@/lib/ai-assistant'
import { cn } from '@/lib/utils'
import { isNativeApp } from '@/lib/runtime'
import { savePhotoNative } from '@/lib/native-photos'

type CapturedPhoto = {
  id: string
  dataUrl: string
}

type UserPhotoOverlay = {
  id: string
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}

type OverlayPointer = {
  x: number
  y: number
}

const FILTER_ENGLISH_NAMES: Record<string, string> = {
  normal: 'Normal',
  warm: 'Warm',
  cool: 'Cool',
  golden: 'Golden Hour',
  'teal-orange': 'Teal-Orange',
  cinematic: 'Cinematic',
  moody: 'Moody',
  film: 'Film',
  vintage: 'Vintage',
  pastel: 'Pastel',
  portrait: 'Portrait',
  bw: 'B&W',
  noir: 'Noir',
  fresh: 'Fresh',
}

export function PoseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const overlayPointersRef = useRef<Map<number, OverlayPointer>>(new Map())
  const overlayGestureRef = useRef<{
    mode: 'drag' | 'pinch'
    startX: number
    startY: number
    startDistance: number
    startAngle: number
    startScale: number
    startRotation: number
    startOverlayX: number
    startOverlayY: number
  } | null>(null)
  const filterSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const didFilterSwipeRef = useRef(false)

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [cameraTransitioning, setCameraTransitioning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraKey, setCameraKey] = useState(0)
  const nativeAppActiveRef = useRef(true)
  const [activeCategory, setActiveCategory] = useState('trending')
  const [activePoseId, setActivePoseId] = useState<string | null>('trending-1')
  const [showGrid, setShowGrid] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState<0 | 3 | 10>(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off')
  const [aspectRatio, setAspectRatio] = useState<'full' | '4:3' | '16:9'>('full')
  const [zoom, setZoom] = useState(1)
  const [exposure, setExposure] = useState(0)
  const [showExposure, setShowExposure] = useState(false)
  const [screenFlash, setScreenFlash] = useState(false)
  const [photos, setPhotos] = useState<CapturedPhoto[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [showReference, setShowReference] = useState(true)
  const [filterId, setFilterId] = useState('normal')
  const [showFilters, setShowFilters] = useState(false)
  const [filterLabelShown, setFilterLabelShown] = useState(true)
  const [photoOverlay, setPhotoOverlay] = useState<UserPhotoOverlay | null>(null)
  const [blurEnabled, setBlurEnabled] = useState(false)
  const [fillLight, setFillLight] = useState(false)
  const [aiControlsVisible, setAiControlsVisible] = useState(true)
  const [aiConsentOpen, setAiConsentOpen] = useState(false)
  const aiConsentAcceptedRef = useRef(false)
  const aiConsentDialogRef = useRef<HTMLDialogElement>(null)
  const aiConsentReturnFocusRef = useRef<HTMLElement | null>(null)
  const [photoToast, setPhotoToast] = useState<string | null>(null)

  useEffect(() => {
    if (!photoToast) return
    const timeout = setTimeout(() => setPhotoToast(null), 5000)
    return () => clearTimeout(timeout)
  }, [photoToast])

  useEffect(() => {
    if (!aiConsentOpen) return
    const dialog = aiConsentDialogRef.current
    if (!dialog) return
    const previousFocus = aiConsentReturnFocusRef.current
    dialog.showModal()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [aiConsentOpen])

  const activePose = POSES.find((p) => p.id === activePoseId) ?? null
  const categoryPoses = POSES.filter((p) => p.category === activeCategory)
  const isMirrored = facingMode === 'user'
  const activeFilter = getFilterById(filterId)

  const { canvasRef: blurCanvasRef, blurReady, blurLoading } = useBackgroundBlur({
    videoRef,
    enabled: blurEnabled,
  })

  // Combined CSS filter for preview (LUT + exposure)
  const previewFilter = [
    activeFilter.css !== 'none' ? activeFilter.css : '',
    exposure !== 0 ? `brightness(${1 + exposure * 0.25})` : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    setFilterLabelShown(false)
    const frame = requestAnimationFrame(() => setFilterLabelShown(true))
    return () => cancelAnimationFrame(frame)
  }, [filterId])

  useEffect(() => {
    let cancelled = false
    let requestVersion = 0
    let removeAppListener: (() => Promise<void>) | undefined

    function stopCamera() {
      requestVersion += 1
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }

    async function startCamera() {
      if (cancelled || document.hidden || !nativeAppActiveRef.current) return
      const previousStream = streamRef.current
      const request = requestVersion
      try {
        setCameraError(null)
        setCameraTransitioning(previousStream !== null)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        })
        if (cancelled || request !== requestVersion || document.hidden || !nativeAppActiveRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        if (cancelled || request !== requestVersion) {
          stream.getTracks().forEach((t) => t.stop())
          if (streamRef.current === stream) {
            streamRef.current = previousStream
            if (videoRef.current) videoRef.current.srcObject = previousStream
          }
          return
        }
        previousStream?.getTracks().forEach((t) => t.stop())
        setCameraTransitioning(false)
      } catch (err) {
        console.log('[v0] Camera error:', err)
        if (!cancelled && request === requestVersion && !document.hidden && nativeAppActiveRef.current) {
          setCameraError('कैमरा एक्सेस नहीं मिला। कृपया कैमरा अनुमति दें।')
          setCameraTransitioning(false)
        }
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) stopCamera()
      else if (nativeAppActiveRef.current) setCameraKey((key) => key + 1)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    if (isNativeApp()) {
      void (async () => {
        try {
          const { App } = await import('@capacitor/app')
          if (cancelled) return
          let stateEvents = 0
          const listener = await App.addListener('appStateChange', ({ isActive }) => {
            if (cancelled) return
            stateEvents += 1
            const wasActive = nativeAppActiveRef.current
            nativeAppActiveRef.current = isActive
            if (!isActive) stopCamera()
            else if (!wasActive && !document.hidden) setCameraKey((key) => key + 1)
          })
          if (cancelled) {
            await listener.remove()
            return
          }
          removeAppListener = () => listener.remove()
          const stateVersion = stateEvents
          const { isActive } = await App.getState()
          if (cancelled) return
          if (stateVersion === stateEvents) nativeAppActiveRef.current = isActive
          await startCamera()
        } catch (err) {
          console.log('[v0] Camera app lifecycle unavailable:', err)
          if (!cancelled) await startCamera()
        }
      })()
    } else {
      void startCamera()
    }
    return () => {
      cancelled = true
      requestVersion += 1
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void removeAppListener?.().catch((err) => console.log('[v0] Camera listener cleanup failed:', err))
    }
  }, [facingMode, cameraKey])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  // Check if the current frame is dark (for auto flash)
  const isFrameDark = useCallback(() => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return false
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(video, 0, 0, 64, 64)
    const { data } = ctx.getImageData(0, 0, 64, 64)
    let total = 0
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    const avg = total / (data.length / 4)
    return avg < 70
  }, [])

  // Try to toggle hardware torch (rear camera)
  const setTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return false
    try {
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean }
      if (!capabilities?.torch) return false
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      return true
    } catch {
      return false
    }
  }, [])

  function cycleFilter(direction: 1 | -1) {
    const currentIndex = CAMERA_FILTERS.findIndex((filter) => filter.id === filterId)
    const nextIndex = (currentIndex + direction + CAMERA_FILTERS.length) % CAMERA_FILTERS.length
    setFilterId(CAMERA_FILTERS[nextIndex].id)
  }

  function handleViewfinderPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('button, input, [data-overlay-interaction]')) return
    filterSwipeStartRef.current = { x: event.clientX, y: event.clientY }
    didFilterSwipeRef.current = false
  }

  function handleViewfinderPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = filterSwipeStartRef.current
    filterSwipeStartRef.current = null
    if (!start) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      cycleFilter(deltaX < 0 ? 1 : -1)
      didFilterSwipeRef.current = true
    }
  }

  function openPhotoPicker() {
    photoInputRef.current?.click()
  }

  function handlePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file || !file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const image = new window.Image()
      image.onload = () => {
        setPhotoOverlay({
          id: `${Date.now()}`,
          dataUrl: reader.result as string,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 0.8,
        })
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  function handleOverlayPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    if (!photoOverlay) return
    event.currentTarget.setPointerCapture(event.pointerId)
    overlayPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = Array.from(overlayPointersRef.current.values())
    if (points.length >= 2) {
      const [first, second] = points
      overlayGestureRef.current = {
        mode: 'pinch',
        startX: 0,
        startY: 0,
        startDistance: Math.hypot(second.x - first.x, second.y - first.y),
        startAngle: Math.atan2(second.y - first.y, second.x - first.x),
        startScale: photoOverlay.scale,
        startRotation: photoOverlay.rotation,
        startOverlayX: photoOverlay.x,
        startOverlayY: photoOverlay.y,
      }
      return
    }
    overlayGestureRef.current = {
      mode: 'drag',
      startX: event.clientX,
      startY: event.clientY,
      startDistance: 0,
      startAngle: 0,
      startScale: photoOverlay.scale,
      startRotation: photoOverlay.rotation,
      startOverlayX: photoOverlay.x,
      startOverlayY: photoOverlay.y,
    }
  }

  function handleOverlayPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    if (!photoOverlay || !overlayPointersRef.current.has(event.pointerId)) return
    overlayPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = overlayGestureRef.current
    if (!gesture) return
    const points = Array.from(overlayPointersRef.current.values())
    if (gesture.mode === 'pinch' && points.length >= 2) {
      const [first, second] = points
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      const angle = Math.atan2(second.y - first.y, second.x - first.x)
      const angleDelta = ((angle - gesture.startAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      setPhotoOverlay((current) => current ? {
        ...current,
        scale: Math.max(0.45, Math.min(2.8, gesture.startScale * (distance / Math.max(1, gesture.startDistance)))),
        rotation: gesture.startRotation + (angleDelta * 180) / Math.PI,
      } : null)
      return
    }
    if (gesture.mode === 'drag' && points.length === 1) {
      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setPhotoOverlay((current) => current ? {
        ...current,
        x: gesture.startOverlayX + ((event.clientX - gesture.startX) / rect.width) * 100,
        y: gesture.startOverlayY + ((event.clientY - gesture.startY) / rect.height) * 100,
      } : null)
    }
  }

  function handleOverlayPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation()
    overlayPointersRef.current.delete(event.pointerId)
    if (overlayPointersRef.current.size === 1 && photoOverlay) {
      const [point] = Array.from(overlayPointersRef.current.values())
      overlayGestureRef.current = {
        mode: 'drag',
        startX: point.x,
        startY: point.y,
        startDistance: 0,
        startAngle: 0,
        startScale: photoOverlay.scale,
        startRotation: photoOverlay.rotation,
        startOverlayX: photoOverlay.x,
        startOverlayY: photoOverlay.y,
      }
    } else if (overlayPointersRef.current.size === 0) {
      overlayGestureRef.current = null
    }
  }

  const takePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    // When portrait blur is active, capture from the processed canvas
    const source: HTMLVideoElement | HTMLCanvasElement =
      blurReady && blurCanvasRef.current && blurCanvasRef.current.width > 0
        ? blurCanvasRef.current
        : video

    const shouldFlash =
      flashMode === 'on' || (flashMode === 'auto' && isFrameDark())

    let torchUsed = false
    if (shouldFlash) {
      if (facingMode === 'environment') {
        torchUsed = await setTorch(true)
      }
      if (!torchUsed) {
        // Screen flash for front camera or when torch is unsupported
        setScreenFlash(true)
      }
      // Give the sensor a moment to adjust to the light
      await new Promise((r) => setTimeout(r, torchUsed ? 350 : 250))
    }

    // Center-crop the frame to the selected aspect ratio (portrait)
    let sx = 0
    let sy = 0
    let sw = video.videoWidth
    let sh = video.videoHeight
    if (aspectRatio !== 'full') {
      const targetR = aspectRatio === '4:3' ? 3 / 4 : 9 / 16
      const videoR = sw / sh
      if (videoR > targetR) {
        sw = Math.round(sh * targetR)
        sx = Math.round((video.videoWidth - sw) / 2)
      } else {
        sh = Math.round(sw / targetR)
        sy = Math.round((video.videoHeight - sh) / 2)
      }
    }

    // Apply digital zoom: crop into the center of the (aspect-cropped) frame
    if (zoom > 1) {
      const zw = Math.round(sw / zoom)
      const zh = Math.round(sh / zoom)
      sx += Math.round((sw - zw) / 2)
      sy += Math.round((sh - zh) / 2)
      sw = zw
      sh = zh
    }

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      if (torchUsed) setTorch(false)
      setScreenFlash(false)
      return
    }

    if (isMirrored) {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    // Bake the LUT filter + exposure into the captured frame.
    // ctx.filter is not supported on iOS Safari and some mobile browsers,
    // so fall back to applying the filter directly on the pixels there.
    const canUseCtxFilter = supportsCanvasFilter()
    if (previewFilter && canUseCtxFilter) {
      ctx.filter = previewFilter
    }
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)

    // User-selected photo overlays are composited after the camera frame so
    // they remain part of the downloaded photo, including mirror/zoom/filter.
    if (photoOverlay) {
      const overlayImage = new window.Image()
      await new Promise<void>((resolve) => {
        overlayImage.onload = () => resolve()
        overlayImage.onerror = () => resolve()
        overlayImage.src = photoOverlay.dataUrl
        if (overlayImage.complete) resolve()
      })
      if (overlayImage.naturalWidth > 0 && overlayImage.naturalHeight > 0) {
        const imageRatio = overlayImage.naturalWidth / overlayImage.naturalHeight
        let overlayWidth = sw * 0.72 * photoOverlay.scale * zoom
        let overlayHeight = overlayWidth / imageRatio
        if (overlayHeight > sh * 0.72 * photoOverlay.scale * zoom) {
          overlayHeight = sh * 0.72 * photoOverlay.scale * zoom
          overlayWidth = overlayHeight * imageRatio
        }
        const overlayX = canvas.width / 2 + (photoOverlay.x / 100) * canvas.width * zoom
        const overlayY = canvas.height / 2 + (photoOverlay.y / 100) * canvas.height * zoom
        ctx.save()
        ctx.globalAlpha = photoOverlay.opacity
        ctx.translate(overlayX, overlayY)
        ctx.rotate((photoOverlay.rotation * Math.PI) / 180)
        ctx.drawImage(overlayImage, -overlayWidth / 2, -overlayHeight / 2, overlayWidth, overlayHeight)
        ctx.restore()
      }
    }

    if (previewFilter && !canUseCtxFilter) {
      const matrix = cssFilterToColorMatrix(previewFilter)
      if (matrix) {
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          applyColorMatrix(imageData, matrix)
          ctx.putImageData(imageData, 0, 0)
        } catch (err) {
          console.log('[v0] Pixel filter fallback failed:', err)
        }
      }
    }

    if (torchUsed) setTorch(false)
    setScreenFlash(false)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPhotos((prev) => [{ id: `${Date.now()}`, dataUrl }, ...prev])
    setFlash(true)
    setTimeout(() => setFlash(false), 180)
  }, [isMirrored, flashMode, facingMode, aspectRatio, zoom, previewFilter, photoOverlay, blurReady, blurCanvasRef, isFrameDark, setTorch])

  const handleCapture = useCallback(() => {
    if (countdown !== null) return
    if (timerSeconds === 0) {
      takePhoto()
      return
    }
    let remaining = timerSeconds
    setCountdown(remaining)
    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        setCountdown(null)
        takePhoto()
      } else {
        setCountdown(remaining)
      }
    }, 1000)
  }, [countdown, timerSeconds, takePhoto])

  // ---------- AI Assistant (Gemini Live) ----------
  const handleCaptureRef = useRef(handleCapture)
  useEffect(() => {
    handleCaptureRef.current = handleCapture
  }, [handleCapture])

  // Small JPEG frame from the camera so the AI can "see" the screen
  const getVideoFrame = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return null
    const source: HTMLVideoElement | HTMLCanvasElement =
      blurReady && blurCanvasRef.current && blurCanvasRef.current.width > 0 ? blurCanvasRef.current : video
    const w = 320
    const h = Math.round((video.videoHeight / video.videoWidth) * w)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
    return dataUrl.split(',')[1] ?? null
  }, [blurReady, blurCanvasRef])

  const actionsRef = useRef<AiCameraActions | null>(null)
  actionsRef.current = {
    selectPose: (poseId) => {
      const pose = POSES.find((p) => p.id === poseId)
      if (!pose) return `Pose "${poseId}" नहीं मिला`
      setActiveCategory(pose.category)
      setActivePoseId(pose.id)
      setShowReference(true)
      return `Pose लग गया: ${pose.alt}`
    },
    setZoom: (level) => {
      const z = [1, 2, 3].includes(level) ? level : 1
      setZoom(z)
      return `Zoom ${z}x हो गया`
    },
    setTimer: (seconds) => {
      const t = seconds === 3 ? 3 : seconds === 10 ? 10 : 0
      setTimerSeconds(t)
      return t === 0 ? 'Timer बंद हो गया' : `Timer ${t} second set हो गया`
    },
    capturePhoto: () => {
      handleCaptureRef.current()
      return 'Photo खींच ली गई'
    },
    setFlash: (mode) => {
      const m = mode === 'on' ? 'on' : mode === 'auto' ? 'auto' : 'off'
      setFlashMode(m)
      return `Flash ${m === 'off' ? 'बंद' : m === 'on' ? 'चालू' : 'auto'} हो गया`
    },
    setExposure: (value) => {
      const v = Math.max(-2, Math.min(2, Math.round(value * 2) / 2))
      setExposure(v)
      return `Exposure ${v > 0 ? '+' : ''}${v} हो गया`
    },
    applyFilter: (fid) => {
      const f = CAMERA_FILTERS.find((x) => x.id === fid)
      if (!f) return `Filter "${fid}" नहीं मिला`
      setFilterId(f.id)
      setShowFilters(true)
      return `Filter लग गया: ${f.label}`
    },
    setBackgroundBlur: (enabled) => {
      setBlurEnabled(enabled)
      return enabled ? 'Background blur चालू हो गया' : 'Background blur बंद हो गया'
    },
    switchCamera: () => {
      setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))
      return 'Camera switch हो गया'
    },
    turnOnLight: (on) => {
      if (facingMode === 'environment') {
        setTorch(on)
        return on ? 'Torch चालू हो गई' : 'Torch बंद हो गई'
      }
      setFillLight(on)
      return on ? 'Screen light चालू हो गई' : 'Screen light बंद हो गई'
    },
    setAspectRatio: (ratio) => {
      const r = ratio === '4:3' ? '4:3' : ratio === '16:9' ? '16:9' : 'full'
      setAspectRatio(r)
      return `Aspect ratio ${r === 'full' ? 'full screen' : r} हो गया`
    },
    setGrid: (enabled) => {
      setShowGrid(enabled)
      return enabled ? 'Grid चालू हो गया' : 'Grid बंद हो गया'
    },
    selectCategory: (categoryId) => {
      const cat = POSE_CATEGORIES.find((c) => c.id === categoryId)
      if (!cat) return `Category "${categoryId}" नहीं मिली`
      setActiveCategory(cat.id)
      const first = POSES.find((p) => p.category === cat.id)
      setActivePoseId(first ? first.id : null)
      setShowReference(true)
      return `Category बदल गई: ${cat.label}${first ? `, pose लगा: ${first.alt}` : ''}`
    },
    clearPose: () => {
      setActivePoseId(null)
      return 'Pose हटा दिया गया, अब normal camera है'
    },
    showPoseReference: (visible) => {
      setShowReference(visible)
      return visible ? 'Reference photo दिख रही है' : 'Reference photo छुपा दी गई'
    },
    openGallery: (open) => {
      setGalleryOpen(open)
      if (open) {
        return photos.length === 0 ? 'गैलरी खोल दी, अभी कोई photo नहीं है' : `गैलरी खोल दी, ${photos.length} photos हैं`
      }
      return 'गैलरी बंद कर दी'
    },
    downloadLastPhoto: () => {
      if (photos.length === 0) return 'अभी कोई photo नहीं है, पहले photo खींचो'
      downloadPhoto(photos[0])
      if (isNativeApp()) return 'आखिरी photo सेव करने की प्रक्रिया शुरू हो गई; नतीजा स्क्रीन पर दिखेगा'
      return 'आखिरी photo download हो गई'
    },
    getCameraStatus: () => {
      const pose = POSES.find((p) => p.id === activePoseId)
      const cat = POSE_CATEGORIES.find((c) => c.id === activeCategory)
      const filter = getFilterById(filterId)
      return [
        `Camera: ${facingMode === 'user' ? 'front' : 'back'}`,
        `Pose: ${pose ? `${pose.id} (${pose.alt})` : 'कोई नहीं'}`,
        `Category: ${cat?.label ?? activeCategory}`,
        `Reference photo: ${showReference ? 'दिख रही है' : 'छुपी है'}`,
        `Filter: ${filter.label} (${filter.id})`,
        `Zoom: ${zoom}x`,
        `Timer: ${timerSeconds === 0 ? 'off' : `${timerSeconds}s`}`,
        `Flash: ${flashMode}`,
        `Exposure: ${exposure > 0 ? '+' : ''}${exposure}`,
        `Aspect ratio: ${aspectRatio}`,
        `Background blur: ${blurEnabled ? 'on' : 'off'}`,
        `Grid: ${showGrid ? 'on' : 'off'}`,
        `Light: ${fillLight ? 'on' : 'off'}`,
        `Photos खींची गईं: ${photos.length}`,
        `Gallery: ${galleryOpen ? 'खुली है' : 'बंद है'}`,
      ].join(', ')
    },
  }

  const ai = useGeminiLive({ actionsRef, getVideoFrame })

  function requestAiConnection() {
    if (ai.status === 'connecting') return
    let accepted = aiConsentAcceptedRef.current
    try {
      accepted = accepted || localStorage.getItem('pose_ai_consent_v1') === 'true'
    } catch {
      // Consent remains valid for this camera session if storage is unavailable.
    }
    if (accepted) {
      aiConsentAcceptedRef.current = true
      ai.connect()
    } else {
      aiConsentReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setAiConsentOpen(true)
    }
  }

  function acceptAiConsent() {
    aiConsentAcceptedRef.current = true
    try {
      localStorage.setItem('pose_ai_consent_v1', 'true')
    } catch {
      // The in-memory acceptance still allows the requested call.
    }
    setAiConsentOpen(false)
    ai.connect()
  }

  // WhatsApp-style auto-hide for AI call controls
  useEffect(() => {
    if (ai.status !== 'connected' || !aiControlsVisible) return
    const t = setTimeout(() => setAiControlsVisible(false), 4000)
    return () => clearTimeout(t)
  }, [ai.status, aiControlsVisible])

  useEffect(() => {
    if (ai.status === 'connected') setAiControlsVisible(true)
  }, [ai.status])

  function handleViewfinderTap() {
    if (didFilterSwipeRef.current) {
      didFilterSwipeRef.current = false
      return
    }
    if (ai.status === 'connected') {
      setAiControlsVisible((v) => !v)
    }
  }
  // ---------- End AI Assistant ----------

  function cycleTimer() {
    setTimerSeconds((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))
  }

  function selectCategory(id: string) {
    setActiveCategory(id)
    const first = POSES.find((p) => p.category === id)
    setActivePoseId(first ? first.id : null)
    setShowReference(true)
  }

  function selectPose(id: string) {
    setActivePoseId(id)
    setShowReference(true)
  }

  async function downloadPhoto(photo: CapturedPhoto) {
    if (isNativeApp()) {
      setPhotoToast('फोटो सेव हो रही है...')
      const saved = await savePhotoNative(photo.dataUrl, `pose-photo-${photo.id}.jpg`, (destination) => {
        setPhotoToast(destination === 'gallery'
          ? 'गैलरी में सेव हो गई — Pose Guide एल्बम।'
          : 'शेयर विकल्प खोला गया। फोटो गैलरी में सेव होने की पुष्टि नहीं हुई है।')
      })
      if (!saved) setPhotoToast('फोटो सेव या शेयर नहीं हो सकी। फिर से कोशिश करें।')
      return
    }
    const a = document.createElement('a')
    a.href = photo.dataUrl
    a.download = `pose-photo-${photo.id}.jpg`
    a.click()
  }

  return (
    <div className="relative mx-auto flex h-svh w-full max-w-md flex-col overflow-hidden bg-background" style={{
      paddingLeft: 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))',
      paddingRight: 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))',
    }}>
      {/* Top bar */}
      <header className="z-10 flex items-center justify-between px-4 py-3" style={{ paddingTop: 'calc(0.75rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))' }}>
        <Link
          href="/"
          className="flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
          aria-label="वापस जाएँ"
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAspectRatio((r) => (r === 'full' ? '4:3' : r === '4:3' ? '16:9' : 'full'))}
            className={cn(
              'flex h-10 items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors hover:bg-accent',
              aspectRatio !== 'full' ? 'text-primary' : 'text-foreground',
            )}
            aria-label={`आस्पेक्ट रेशियो: ${aspectRatio === 'full' ? 'फुल स्क्रीन' : aspectRatio}`}
          >
            {aspectRatio === 'full' ? 'Full' : aspectRatio}
          </button>
          <button
            type="button"
            onClick={() => setFlashMode((m) => (m === 'off' ? 'on' : m === 'on' ? 'auto' : 'off'))}
            className={cn(
              'flex h-10 items-center justify-center gap-1 rounded-full px-2 transition-colors hover:bg-accent',
              flashMode !== 'off' ? 'text-primary' : 'text-foreground',
            )}
            aria-label={`फ्लैश: ${flashMode === 'off' ? 'बंद' : flashMode === 'on' ? 'चालू' : 'ऑटो'}`}
          >
            {flashMode === 'off' ? (
              <ZapOff className="size-5" aria-hidden="true" />
            ) : (
              <Zap className="size-5" aria-hidden="true" />
            )}
            {flashMode === 'auto' && <span className="text-sm font-semibold">A</span>}
          </button>
          <button
            type="button"
            onClick={cycleTimer}
            className={cn(
              'flex h-10 items-center justify-center gap-1 rounded-full px-2 transition-colors hover:bg-accent',
              timerSeconds > 0 ? 'text-primary' : 'text-foreground',
            )}
            aria-label={`टाइमर: ${timerSeconds === 0 ? 'बंद' : `${timerSeconds} सेकंड`}`}
          >
            <Timer className="size-5" aria-hidden="true" />
            {timerSeconds > 0 && <span className="text-sm font-semibold">{timerSeconds}s</span>}
          </button>
          <button
            type="button"
            onClick={() => setShowExposure((s) => !s)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full transition-colors hover:bg-accent',
              exposure !== 0 || showExposure ? 'text-primary' : 'text-foreground',
            )}
            aria-label={`एक्सपोज़र: ${exposure > 0 ? '+' : ''}${exposure}`}
            aria-pressed={showExposure}
          >
            <Sun className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full transition-colors hover:bg-accent',
              filterId !== 'normal' || showFilters ? 'text-primary' : 'text-foreground',
            )}
            aria-label={showFilters ? 'फ़िल्टर बंद करें' : 'फ़िल्टर खोलें'}
            aria-pressed={showFilters}
          >
            <Palette className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setBlurEnabled((b) => !b)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full transition-colors hover:bg-accent',
              blurEnabled ? 'text-primary' : 'text-foreground',
            )}
            aria-label={blurEnabled ? 'बैकग्राउंड ब्लर बंद करें' : 'बैकग्राउंड ब्लर चालू करें'}
            aria-pressed={blurEnabled}
          >
            <Aperture className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full transition-colors hover:bg-accent',
              showGrid ? 'text-primary' : 'text-foreground',
            )}
            aria-label={showGrid ? 'ग्रिड बंद करें' : 'ग्रिड चालू करें'}
            aria-pressed={showGrid}
          >
            <Grid3x3 className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoFileChange}
        className="sr-only"
        aria-label="गैलरी से फोटो चुनें"
      />

      {/* Viewfinder */}
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-black">
        <div
          className={cn(
            'relative overflow-hidden',
            aspectRatio === 'full' ? 'size-full' : 'max-h-full w-full',
          )}
          style={aspectRatio === 'full' ? undefined : { aspectRatio: aspectRatio === '4:3' ? '3 / 4' : '9 / 16' }}
          onClick={handleViewfinderTap}
          onPointerDown={handleViewfinderPointerDown}
          onPointerUp={handleViewfinderPointerUp}
          onPointerCancel={handleViewfinderPointerUp}
        >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn('size-full object-cover transition-[opacity,transform] duration-300', blurReady && 'opacity-0')}
          style={{
            transform: `${isMirrored ? 'scaleX(-1) ' : ''}scale(${zoom})`,
            filter: previewFilter || undefined,
            opacity: cameraTransitioning ? 0.84 : 1,
          }}
        />

        {/* Portrait-mode blur canvas (person sharp, background blurred) */}
        <canvas
          ref={blurCanvasRef}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 size-full object-cover transition-transform duration-200',
            !blurReady && 'hidden',
          )}
          style={{
            transform: `${isMirrored ? 'scaleX(-1) ' : ''}scale(${zoom})`,
            filter: previewFilter || undefined,
          }}
        />

        {/* Swipe the viewfinder left/right to change filters. The compact label
            keeps the current Hindi/English filter visible during the gesture. */}
        {!cameraError && (
          <div
            key={activeFilter.id}
            className={cn(
              'pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-center text-white shadow-lg backdrop-blur transition-all duration-300',
              filterLabelShown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
            )}
            role="status"
            aria-live="polite"
          >
            <span className="block text-xs font-semibold">{activeFilter.label}</span>
            <span className="block text-[10px] text-white/75">{FILTER_ENGLISH_NAMES[activeFilter.id]}</span>
          </div>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            openPhotoPicker()
          }}
          className="absolute right-3 top-16 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80"
          aria-label={photoOverlay ? 'गैलरी से दूसरा फोटो चुनें' : 'गैलरी से फोटो ओवरले चुनें'}
        >
          <ImageIcon className="size-4" aria-hidden="true" />
          <span className="text-xs font-semibold">फोटो ओवरले</span>
        </button>

        {/* Blur model loading indicator */}
        {blurEnabled && blurLoading && (
          <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur">
            <Loader2 className="size-4 animate-spin text-white" aria-hidden="true" />
            <span className="text-xs font-medium text-white">Blur लोड हो रहा है...</span>
          </div>
        )}

        {/* AI fill light (front camera): bright frame around the edges */}
        {fillLight && (
          <div
            className="pointer-events-none absolute inset-0 z-10 border-[28px] border-white"
            style={{ boxShadow: 'inset 0 0 60px 30px rgba(255,255,255,0.85)' }}
            aria-hidden="true"
          />
        )}

        {/* Pose overlay: black background becomes transparent with screen blend */}
        {activePose && !cameraError && (
          <img
            src={activePose.src || '/placeholder.svg'}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-contain opacity-80 mix-blend-screen"
          />
        )}

        {/* Free user photo overlay. Drag with one finger; pinch to scale and
            twist with two fingers. It follows the viewfinder zoom. */}
        {photoOverlay && !cameraError && (
          <div
            data-overlay-interaction
            className="absolute z-10 overflow-visible"
            style={{
              left: `calc(50% + ${isMirrored ? -photoOverlay.x : photoOverlay.x}%)`,
              top: `calc(50% + ${photoOverlay.y}%)`,
              width: '72%',
              aspectRatio: `${photoOverlay.naturalWidth} / ${photoOverlay.naturalHeight}`,
              maxHeight: '72%',
              transform: `translate(-50%, -50%) scale(${photoOverlay.scale * zoom})${isMirrored ? ' scaleX(-1)' : ''} rotate(${photoOverlay.rotation}deg)`,
              touchAction: 'none',
            }}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            onPointerCancel={handleOverlayPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoOverlay.dataUrl} alt="आपकी फोटो ओवरले" className="size-full object-contain" style={{ opacity: photoOverlay.opacity }} />
            <button
              type="button"
              data-overlay-interaction
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setPhotoOverlay(null)
              }}
              className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-black/75 text-white shadow-lg"
              aria-label="ओवरले फोटो हटाएँ"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {photoOverlay && !cameraError && (
          <div
            data-overlay-interaction
            className="absolute bottom-14 left-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-black/65 px-2 py-1.5 text-white shadow-lg backdrop-blur"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="group"
            aria-label="फोटो ओवरले कंट्रोल"
          >
            <button
              type="button"
              onClick={() => setPhotoOverlay((current) => current ? { ...current, scale: Math.max(0.45, current.scale - 0.1) } : null)}
              className="flex size-7 items-center justify-center rounded-full bg-white/15 text-sm font-bold hover:bg-white/25"
              aria-label="ओवरले छोटा करें"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setPhotoOverlay((current) => current ? { ...current, scale: Math.min(2.8, current.scale + 0.1) } : null)}
              className="flex size-7 items-center justify-center rounded-full bg-white/15 text-sm font-bold hover:bg-white/25"
              aria-label="ओवरले बड़ा करें"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setPhotoOverlay((current) => current ? { ...current, rotation: current.rotation - 15 } : null)}
              className="flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-bold hover:bg-white/25"
              aria-label="ओवरले बाएँ घुमाएँ"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={() => setPhotoOverlay((current) => current ? { ...current, rotation: current.rotation + 15 } : null)}
              className="flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-bold hover:bg-white/25"
              aria-label="ओवरले दाएँ घुमाएँ"
            >
              ↻
            </button>
            <label className="flex items-center gap-1 px-1" data-overlay-interaction>
              <span className="sr-only">ओवरले opacity</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={photoOverlay.opacity}
                onChange={(event) => setPhotoOverlay((current) => current ? { ...current, opacity: Number(event.target.value) } : null)}
                className="w-16 accent-white"
                aria-label="ओवरले opacity"
              />
            </label>
            <button
              type="button"
              onClick={() => setPhotoOverlay(null)}
              className="flex size-7 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
              aria-label="ओवरले फोटो हटाएँ"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Reference photo card (top-left, like phone camera apps) */}
        {activePose && !cameraError && showReference && (
          <div className="absolute left-3 top-3 z-10">
            <div className="relative overflow-hidden rounded-lg border-2 border-primary bg-black/60 shadow-lg shadow-primary/20 backdrop-blur">
              <img
                src={getPoseReferencePhoto(activePose) || '/placeholder.svg'}
                alt={activePose.alt}
                className="size-24 object-cover"
                onError={(e) => {
                  const fallback = CATEGORY_REFERENCE_PHOTOS[activePose.category]
                  if (fallback && e.currentTarget.src !== fallback) {
                    e.currentTarget.src = fallback
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowReference(false)}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                aria-label="रेफरेंस फोटो बंद करें"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Grid overlay */}
        {showGrid && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
            <div className="absolute left-0 top-1/3 h-px w-full bg-white/40" />
            <div className="absolute left-0 top-2/3 h-px w-full bg-white/40" />
          </div>
        )}

        {/* Exposure slider */}
        {showExposure && !cameraError && (
          <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-full bg-black/50 px-1.5 py-3 backdrop-blur">
            <span className="text-xs font-semibold text-white" aria-hidden="true">
              {exposure > 0 ? `+${exposure}` : exposure}
            </span>
            <input
              type="range"
              min={-2}
              max={2}
              step={0.5}
              value={exposure}
              onChange={(e) => setExposure(Number(e.target.value))}
              className="h-32 w-6 accent-white"
              style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
              aria-label="एक्सपोज़र स्लाइडर"
            />
            <Sun className="size-4 text-white" aria-hidden="true" />
          </div>
        )}

        {/* Zoom controls */}
        {!cameraError && (
          <div
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 px-1.5 py-1 backdrop-blur"
            role="group"
            aria-label="ज़ूम"
          >
            {[1, 2, 3].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setZoom(level)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  zoom === level ? 'bg-primary text-primary-foreground' : 'text-white hover:bg-white/20',
                )}
                aria-label={`${level}x ज़ूम`}
                aria-pressed={zoom === level}
              >
                {level}x
              </button>
            ))}
          </div>
        )}

        {/* Filter strip */}
        {showFilters && !cameraError && (
          <div
            className="absolute bottom-14 left-0 right-0 z-10 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]"
            role="listbox"
            aria-label="फ़िल्टर चुनें"
          >
            {CAMERA_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setFilterId(f.id)
                }}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors',
                  filterId === f.id ? 'bg-primary text-primary-foreground' : 'bg-black/50 text-white hover:bg-black/70',
                )}
                role="option"
                aria-selected={filterId === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* AI Assistant: start button (idle / error) */}
        {!cameraError && ai.status !== 'connected' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (ai.status === 'connecting') return
              requestAiConnection()
            }}
            className={cn(
              'absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/60 py-2 pl-3 pr-4 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80',
            )}
            aria-label="AI असिस्टेंट कॉल शुरू करें"
            disabled={ai.status === 'connecting'}
          >
            {ai.status === 'connecting' ? (
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
            )}
            <span className="text-sm font-semibold">
              {ai.status === 'connecting' ? 'कनेक्ट हो रहा है...' : 'AI असिस्टेंट'}
            </span>
          </button>
        )}

        {/* AI speaking indicator (always visible during call) */}
        {ai.status === 'connected' && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/60 py-1.5 pl-2 pr-3 backdrop-blur" role="status">
            <span
              className={cn(
                'relative flex size-7 items-center justify-center rounded-full bg-primary/20',
                ai.aiSpeaking && 'animate-pulse',
              )}
              aria-hidden="true"
            >
              {ai.aiSpeaking && <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />}
              <Sparkles className="relative size-4 text-primary" />
            </span>
            <span className="text-xs font-semibold text-white">
              {ai.aiSpeaking ? 'AI बोल रहा है...' : 'AI सुन रहा है'}
            </span>
          </div>
        )}

        {/* AI call controls (WhatsApp-style, auto-hide) */}
        {ai.status === 'connected' && (
          <div
            className={cn(
              'absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/60 px-4 py-2.5 shadow-lg backdrop-blur transition-all duration-300',
              aiControlsVisible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
            )}
            role="group"
            aria-label="AI कॉल कंट्रोल"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ai.toggleMute()
              }}
              className={cn(
                'flex size-11 items-center justify-center rounded-full transition-colors',
                ai.muted ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30',
              )}
              aria-label={ai.muted ? 'माइक अनम्यूट करें' : 'माइक म्यूट करें'}
              aria-pressed={ai.muted}
            >
              {ai.muted ? <MicOff className="size-5" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ai.toggleSpeaker()
              }}
              className={cn(
                'flex size-11 items-center justify-center rounded-full transition-colors',
                ai.speakerLoud ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30',
              )}
              aria-label={ai.speakerLoud ? 'स्पीकर नॉर्मल करें' : 'स्पीकर तेज़ करें'}
              aria-pressed={ai.speakerLoud}
            >
              {ai.speakerLoud ? (
                <Volume2 className="size-5" aria-hidden="true" />
              ) : (
                <VolumeX className="size-5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                ai.disconnect()
              }}
              className="flex size-11 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700"
              aria-label="AI कॉल समाप्त करें"
            >
              <PhoneOff className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* AI error toast */}
        {ai.errorMsg && ai.status === 'error' && (
          <div className="absolute left-1/2 top-16 z-10 w-[85%] -translate-x-1/2 rounded-xl bg-black/70 px-4 py-2.5 text-center backdrop-blur">
            <p className="text-xs text-white text-balance">{ai.errorMsg}</p>
          </div>
        )}

        {/* Countdown */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <span className="text-8xl font-bold text-white drop-shadow-lg">{countdown}</span>
          </div>
        )}

        {/* Flash effect */}
        {flash && <div className="absolute inset-0 bg-white/90" aria-hidden="true" />}

        {/* Screen flash (fill light for front camera) */}
        {screenFlash && <div className="fixed inset-0 z-50 bg-white" aria-hidden="true" />}

        {/* Camera error */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <p className="text-center text-base text-muted-foreground text-balance">{cameraError}</p>
            <button
              type="button"
              onClick={() => setCameraKey((key) => key + 1)}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              फिर से कोशिश करें
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Controls */}
      <div className="z-10 flex flex-col gap-3 pb-4 pt-3" style={{ paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}>
        <div className="flex items-center justify-around px-6">
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="relative flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted"
            aria-label={`गैलरी खोलें, ${photos.length} फोटो`}
          >
            {photos.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[0].dataUrl || '/placeholder.svg'} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={handleCapture}
            disabled={!!cameraError}
            className="flex size-[76px] items-center justify-center rounded-full border-4 border-foreground disabled:opacity-40"
            aria-label="फोटो खींचें"
          >
            <span className="flex size-[62px] items-center justify-center rounded-full bg-foreground transition-transform active:scale-90">
              <span className="block size-[52px] rounded-full border-4 border-primary" aria-hidden="true" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))}
            className="flex size-14 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent"
            aria-label="कैमरा बदलें"
          >
            <SwitchCamera className="size-6" aria-hidden="true" />
          </button>
        </div>

        {/* Category tabs */}
        <nav className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="पोज़ श्रेणियाँ">
          {POSE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCategory(cat.id)}
              className={cn(
                'shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={activeCategory === cat.id}
            >
              {cat.label}
            </button>
          ))}
        </nav>

        {/* Pose thumbnails */}
        <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="listbox" aria-label="पोज़ चुनें">
          <button
            type="button"
            onClick={() => setActivePoseId(null)}
            className={cn(
              'flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted transition-colors',
              activePoseId === null ? 'ring-2 ring-primary' : 'hover:bg-accent',
            )}
            role="option"
            aria-selected={activePoseId === null}
            aria-label="कोई पोज़ नहीं"
          >
            <Ban className="size-6 text-muted-foreground" aria-hidden="true" />
          </button>
          {categoryPoses.map((pose) => (
            <button
              key={pose.id}
              type="button"
              onClick={() => selectPose(pose.id)}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-xl bg-muted transition-colors',
                activePoseId === pose.id ? 'ring-2 ring-primary' : 'hover:bg-accent',
              )}
              role="option"
              aria-selected={activePoseId === pose.id}
              aria-label={pose.alt}
            >
              <Image src={pose.src || '/placeholder.svg'} alt="" width={64} height={64} className="size-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* Gallery sheet */}
      {galleryOpen && (
        <div className="absolute inset-0 z-20 flex flex-col bg-background" role="dialog" aria-label="आपकी गैलरी" style={{
          paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
          paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))',
          paddingRight: 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))',
        }}>
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-lg font-semibold">आपकी गैलरी</h2>
            <button
              type="button"
              onClick={() => setGalleryOpen(false)}
              className="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-accent"
              aria-label="गैलरी बंद करें"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {photos.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="text-center text-muted-foreground text-balance">
                अभी कोई फोटो नहीं है। कैमरा से फोटो खींचें!
              </p>
            </div>
          ) : (
            <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4">
              {photos.map((photo) => (
                <div key={photo.id} className="relative overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.dataUrl || '/placeholder.svg'} alt="खींची गई फोटो" className="aspect-[3/4] w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => downloadPhoto(photo)}
                    className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
                    aria-label="फोटो डाउनलोड करें"
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {photoToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute left-4 right-4 z-50 rounded-xl bg-black/85 px-4 py-3 text-center text-sm text-white shadow-lg"
          style={{ top: 'calc(1rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))' }}
        >
          {photoToast}
        </div>
      )}
      {aiConsentOpen && (
        <dialog
          ref={aiConsentDialogRef}
          aria-labelledby="ai-consent-title"
          aria-describedby="ai-consent-description"
          onCancel={() => setAiConsentOpen(false)}
          className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-black/60 p-4 text-foreground backdrop:bg-black/40 open:flex open:items-center open:justify-center"
          style={{
            paddingTop: 'calc(1rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
            paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
            paddingLeft: 'calc(1rem + var(--safe-area-inset-left, env(safe-area-inset-left, 0px)))',
            paddingRight: 'calc(1rem + var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))',
          }}
        >
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-background p-6 shadow-xl">
            <h2 id="ai-consent-title" className="mb-3 text-lg font-semibold">AI असिस्टेंट</h2>
            <p id="ai-consent-description" className="text-sm leading-relaxed">
              AI असिस्टेंट चालू करने पर आपके माइक का ऑडियो और कैमरे के छोटे फ्रेम (लगभग हर सेकंड) रियल-टाइम में Google Gemini को भेजे जाएँगे ताकि वह आपको गाइड कर सके। आपकी फोटो आपके फोन में ही रहती हैं।
            </p>
            <Link href="/privacy" className="mt-4 inline-block text-sm text-primary underline">गोपनीयता नीति</Link>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" autoFocus onClick={() => setAiConsentOpen(false)} className="rounded-full bg-muted px-4 py-2 text-sm font-semibold">
                रद्द करें
              </button>
              <button type="button" onClick={acceptAiConsent} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                सहमत हूँ
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  )
}
