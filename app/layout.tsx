import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { NativeBootstrap } from '@/components/native-bootstrap'
import './globals.css'

const _poppins = Poppins({ subsets: ['latin', 'devanagari'], weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'पोज़ गाइड - Pose Camera',
  description: 'पोज़ गाइड के साथ परफेक्ट फोटो खींचें - pose overlay camera app',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: '#0a0a0a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="hi" className="bg-background">
      <body className="antialiased font-sans">
        {children}
        <NativeBootstrap />
        {process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_BUILD_TARGET !== 'mobile' && <Analytics />}
      </body>
    </html>
  )
}
