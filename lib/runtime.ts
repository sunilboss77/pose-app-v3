import { Capacitor } from '@capacitor/core'

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function apiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (baseUrl) return `${baseUrl}/${path.replace(/^\/+/, '')}`
  if (isNativeApp()) {
    console.error('[runtime] NEXT_PUBLIC_API_BASE_URL is missing. Set it to the deployed HTTPS backend URL for native AI calls.')
  }
  return path
}
