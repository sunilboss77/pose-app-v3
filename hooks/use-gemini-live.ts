'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'
import { AI_SYSTEM_INSTRUCTION, AI_TOOL_DECLARATIONS, type AiCameraActions } from '@/lib/ai-assistant'

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest'
const INPUT_SAMPLE_RATE = 16000
const OUTPUT_SAMPLE_RATE = 24000

export type AiCallStatus = 'idle' | 'connecting' | 'connected' | 'error'

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000
  return float32
}

export function useGeminiLive({
  actionsRef,
  getVideoFrame,
}: {
  actionsRef: React.RefObject<AiCameraActions | null>
  getVideoFrame: () => string | null
}) {
  const [status, setStatus] = useState<AiCallStatus>('idle')
  const [muted, setMuted] = useState(false)
  const [speakerLoud, setSpeakerLoud] = useState(false)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sessionRef = useRef<Session | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const inputCtxRef = useRef<AudioContext | null>(null)
  const outputCtxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const nextPlayTimeRef = useRef(0)
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mutedRef = useRef(false)
  const activeRef = useRef(false)
  // Gate: while a tool call is pending, sending realtime input (audio/video)
  // makes the server close the connection with error 1008. Block it.
  const toolCallPendingRef = useRef(false)
  // Session resumption handle so we can silently reconnect if the socket drops
  const resumeHandleRef = useRef<string | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const openSessionRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = speakerLoud ? 2.8 : 1
    }
  }, [speakerLoud])

  const stopPlayback = useCallback(() => {
    scheduledSourcesRef.current.forEach((src) => {
      try {
        src.stop()
      } catch {
        // already stopped
      }
    })
    scheduledSourcesRef.current.clear()
    nextPlayTimeRef.current = 0
    setAiSpeaking(false)
  }, [])

  const disconnect = useCallback(() => {
    activeRef.current = false
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current)
      frameIntervalRef.current = null
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current)
      speakingTimeoutRef.current = null
    }
    stopPlayback()
    processorRef.current?.disconnect()
    processorRef.current = null
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    inputCtxRef.current?.close().catch(() => {})
    inputCtxRef.current = null
    outputCtxRef.current?.close().catch(() => {})
    outputCtxRef.current = null
    gainRef.current = null
    try {
      sessionRef.current?.close()
    } catch {
      // ignore
    }
    sessionRef.current = null
    setStatus('idle')
    setAiSpeaking(false)
  }, [stopPlayback])

  const playAudioChunk = useCallback((base64: string) => {
    const ctx = outputCtxRef.current
    const gain = gainRef.current
    if (!ctx || !gain) return
    const float32 = base64ToFloat32(base64)
    if (float32.length === 0) return
    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE)
    buffer.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration
    scheduledSourcesRef.current.add(source)
    setAiSpeaking(true)
    source.onended = () => {
      scheduledSourcesRef.current.delete(source)
      if (scheduledSourcesRef.current.size === 0) {
        if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current)
        speakingTimeoutRef.current = setTimeout(() => setAiSpeaking(false), 250)
      }
    }
  }, [])

  const handleToolCall = useCallback((message: LiveServerMessage) => {
    const toolCall = message.toolCall
    const session = sessionRef.current
    const actions = actionsRef.current
    if (!toolCall?.functionCalls || !session || !actions) return

    const functionResponses = toolCall.functionCalls.map((fc) => {
      let result = 'हो गया'
      try {
        const args = (fc.args ?? {}) as Record<string, unknown>
        switch (fc.name) {
          case 'selectPose':
            result = actions.selectPose(String(args.poseId ?? ''))
            break
          case 'setZoom':
            result = actions.setZoom(Number(args.level ?? 1))
            break
          case 'setTimer':
            result = actions.setTimer(Number(args.seconds ?? 0))
            break
          case 'capturePhoto':
            result = actions.capturePhoto()
            break
          case 'setFlash':
            result = actions.setFlash(String(args.mode ?? 'off'))
            break
          case 'setExposure':
            result = actions.setExposure(Number(args.value ?? 0))
            break
          case 'applyFilter':
            result = actions.applyFilter(String(args.filterId ?? 'normal'))
            break
          case 'setBackgroundBlur':
            result = actions.setBackgroundBlur(Boolean(args.enabled))
            break
          case 'switchCamera':
            result = actions.switchCamera()
            break
          case 'turnOnLight':
            result = actions.turnOnLight(Boolean(args.on))
            break
          case 'setAspectRatio':
            result = actions.setAspectRatio(String(args.ratio ?? 'full'))
            break
          case 'setGrid':
            result = actions.setGrid(Boolean(args.enabled))
            break
          case 'selectCategory':
            result = actions.selectCategory(String(args.categoryId ?? ''))
            break
          case 'clearPose':
            result = actions.clearPose()
            break
          case 'showPoseReference':
            result = actions.showPoseReference(Boolean(args.visible))
            break
          case 'openGallery':
            result = actions.openGallery(Boolean(args.open))
            break
          case 'downloadLastPhoto':
            result = actions.downloadLastPhoto()
            break
          case 'getCameraStatus':
            result = actions.getCameraStatus()
            break
          default:
            result = 'अनजान function'
        }
      } catch {
        result = 'Function चलाने में दिक्कत आई'
      }
      return { name: fc.name, id: fc.id, response: { result } }
    })

    session.sendToolResponse({ functionResponses })
  }, [actionsRef])

  const connect = useCallback(async () => {
    if (activeRef.current) return
    activeRef.current = true
    setStatus('connecting')
    setErrorMsg(null)

    try {
      // 1. Get ephemeral token from our server (real API key stays server-side)
      const res = await fetch('/api/ai-token', { method: 'POST' })
      if (!res.ok) throw new Error('token failed')
      const { token } = (await res.json()) as { token: string }

      // 2. Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      micStreamRef.current = micStream

      // 3. Audio contexts
      const inputCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })
      inputCtxRef.current = inputCtx
      const outputCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE })
      outputCtxRef.current = outputCtx
      const gain = outputCtx.createGain()
      gain.gain.value = speakerLoud ? 2.8 : 1
      gain.connect(outputCtx.destination)
      gainRef.current = gain

      // 4. Connect to Gemini Live
      const ai = new GoogleGenAI({ apiKey: token, apiVersion: 'v1alpha' })
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: AI_SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
          contextWindowCompression: { slidingWindow: {} },
        },
        callbacks: {
          onopen: () => {
            if (activeRef.current) setStatus('connected')
          },
          onmessage: (message: LiveServerMessage) => {
            if (!activeRef.current) return
            if (message.serverContent?.interrupted) {
              stopPlayback()
              return
            }
            const audioData = message.data
            if (audioData) playAudioChunk(audioData)
            if (message.toolCall) handleToolCall(message)
          },
          onerror: (e: ErrorEvent) => {
            console.log('[v0] Gemini Live error:', e.message)
          },
          onclose: () => {
            if (activeRef.current) disconnect()
          },
        },
      })
      if (!activeRef.current) {
        session.close()
        return
      }
      sessionRef.current = session
      setStatus('connected')

      // 5. Stream mic audio (16kHz PCM16)
      const source = inputCtx.createMediaStreamSource(micStream)
      const processor = inputCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      processor.onaudioprocess = (e) => {
        if (!activeRef.current || mutedRef.current || !sessionRef.current) return
        const data = e.inputBuffer.getChannelData(0)
        try {
          sessionRef.current.sendRealtimeInput({
            audio: { data: floatTo16BitPcmBase64(data), mimeType: 'audio/pcm;rate=16000' },
          })
        } catch {
          // session closed mid-stream
        }
      }
      source.connect(processor)
      processor.connect(inputCtx.destination)

      // 6. Stream camera frames (~1 fps) so the AI can see the screen
      frameIntervalRef.current = setInterval(() => {
        if (!activeRef.current || !sessionRef.current) return
        const frame = getVideoFrame()
        if (!frame) return
        try {
          sessionRef.current.sendRealtimeInput({
            video: { data: frame, mimeType: 'image/jpeg' },
          })
        } catch {
          // session closed mid-stream
        }
      }, 1200)

      // 7. Greet the user
      session.sendClientContent({
        turns: 'यूज़र ने अभी AI असिस्टेंट कॉल शुरू की है। उन्हें हिंदी में छोटा सा friendly hello बोलो और पूछो कि कहाँ हैं और किस occasion की photo खींचनी है।',
        turnComplete: true,
      })
    } catch (err) {
      console.log('[v0] AI connect failed:', err)
      activeRef.current = false
      disconnect()
      setStatus('error')
      setErrorMsg('AI असिस्टेंट से कनेक्ट नहीं हो पाया। कृपया दोबारा कोशिश करें।')
    }
  }, [disconnect, getVideoFrame, handleToolCall, playAudioChunk, speakerLoud, stopPlayback])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    status,
    muted,
    speakerLoud,
    aiSpeaking,
    errorMsg,
    connect,
    disconnect,
    toggleMute: () => setMuted((m) => !m),
    toggleSpeaker: () => setSpeakerLoud((s) => !s),
  }
}
