import { GoogleGenAI } from '@google/genai'

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 10
const MAX_IP_ENTRIES = 10_000
// Per-instance only: serverless restarts reset this map. Use Upstash/Vercel KV
// later for a shared durable limit; trust forwarded IP headers only behind the host proxy.
const tokenRequests = new Map<string, { count: number; expiresAt: number }>()

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  })
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'https://localhost,capacitor://localhost,http://localhost')
    .split(',').map((origin) => origin.trim()).filter(Boolean)
  const origin = request.headers.get('origin')
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  return headers
}

function retryAfter(request: Request): number {
  const now = Date.now()
  for (const [ip, entry] of tokenRequests) {
    if (entry.expiresAt <= now) tokenRequests.delete(ip)
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim() || 'unknown'
  const entry = tokenRequests.get(ip)
  if (entry) {
    if (entry.count >= RATE_LIMIT) return Math.ceil((entry.expiresAt - now) / 1000)
    entry.count += 1
  } else {
    // Fail closed at capacity instead of evicting IPs and bypassing their limits.
    if (tokenRequests.size >= MAX_IP_ENTRIES) return Math.ceil(RATE_WINDOW_MS / 1000)
    tokenRequests.set(ip, { count: 1, expiresAt: now + RATE_WINDOW_MS })
  }
  return 0
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

// Creates a short-lived ephemeral token so the browser can connect
// directly to the Gemini Live API without exposing the real API key.
export async function POST(request: Request) {
  const headers = corsHeaders(request)
  const retrySeconds = retryAfter(request)
  if (retrySeconds) {
    headers.set('Retry-After', String(retrySeconds))
    return Response.json({ error: 'बहुत ज़्यादा AI कॉल शुरू की गई हैं। कृपया कुछ देर बाद दोबारा कोशिश करें।' }, { status: 429, headers })
  }
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'GEMINI_API_KEY सेट नहीं है' }, { status: 500, headers })
    }

    const client = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' })

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        httpOptions: { apiVersion: 'v1alpha' },
      },
    })

    return Response.json({ token: token.name }, { headers })
  } catch {
    // Provider errors can contain request credentials; never log the raw error.
    console.error('[ai-token] failed:', 'token creation failed')
    return Response.json({ error: 'AI टोकन नहीं बन पाया' }, { status: 500, headers })
  }
}
