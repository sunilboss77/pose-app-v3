import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.sunil.poseguide', // Placeholder: confirm the application ID before release.
  appName: 'Pose Guide',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK', // Capacitor DARK uses light icons on dark backgrounds.
    },
  },
}

export default config
