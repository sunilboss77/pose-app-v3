'use client'

import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function NativeBootstrap() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelled = false

    // Capacitor's Dark styles mean light icons on our dark background.
    // SystemBars styles both bars without unsupported Android 36 overlay/color calls.
    void import('@capacitor/core')
      .then(({ SystemBars, SystemBarsStyle }) => {
        if (!cancelled) return SystemBars.setStyle({ style: SystemBarsStyle.Dark })
      })
      .catch((error) => console.warn('Unable to style native system bars', error))

    void import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => {
        if (!cancelled) return StatusBar.setStyle({ style: Style.Dark })
      })
      .catch((error) => console.warn('Unable to style native status bar', error))

    // Keep splash dismissal independent so an unavailable bar API cannot block it.
    void import('@capacitor/splash-screen')
      .then(({ SplashScreen }) => {
        if (!cancelled) return SplashScreen.hide()
      })
      .catch((error) => console.warn('Unable to hide native splash screen', error))

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return

    let cancelled = false
    let listener: PluginListenerHandle | undefined
    const normalizedPath = (pathname || '/').replace(/\/+$/, '') || '/'

    void import('@capacitor/app')
      .then(async ({ App }) => {
        if (cancelled) return

        const handle = await App.addListener('backButton', () => {
          if (cancelled) return

          if (normalizedPath === '/') {
            void App.exitApp().catch((error) => console.warn('Unable to exit native app', error))
          } else {
            router.push('/')
          }
        })

        // Registration can finish after unmount or a route change.
        if (cancelled) {
          await handle.remove()
        } else {
          listener = handle
        }
      })
      .catch((error) => console.warn('Unable to register native back button', error))

    return () => {
      cancelled = true
      if (listener) {
        void listener.remove().catch((error) => console.warn('Unable to remove native back button', error))
      }
    }
  }, [pathname, router])

  return null
}
