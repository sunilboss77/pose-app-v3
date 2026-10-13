import Link from 'next/link'
import Image from 'next/image'
import { Camera, ImageIcon, ChevronRight } from 'lucide-react'
import { INSPIRATION_PHOTOS } from '@/lib/poses'
import { BottomNav, PremiumBanner } from '@/components/profile-settings'

export default function HomePage() {
  return (
    <main
      className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-4 pb-10 pt-12"
      style={{
        paddingTop: 'max(3rem, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
        paddingBottom: 'calc(6rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        paddingLeft: 'max(1rem, var(--safe-area-inset-left, env(safe-area-inset-left, 0px)))',
        paddingRight: 'max(1rem, var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))',
      }}
    >
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">स्वागत है</p>
        <h1 className="text-3xl font-bold text-balance">पोज़ गाइड</h1>
      </header>

      <PremiumBanner />

      <Link
        href="/camera"
        className="flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Camera className="size-5" aria-hidden="true" />
        कैमरा खोलें
      </Link>

      <Link
        href="/camera"
        className="flex items-center justify-between rounded-2xl bg-card px-4 py-4 transition-colors hover:bg-accent"
      >
        <span className="flex items-center gap-3">
          <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-base font-medium">आपकी गैलरी</span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </Link>

      <section className="flex flex-col gap-4" aria-labelledby="inspo-heading">
        <h2 id="inspo-heading" className="text-lg font-semibold">
          पोज़ प्रेरणा
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {INSPIRATION_PHOTOS.map((photo) => (
            <div key={photo.src} className="overflow-hidden rounded-2xl">
              <Image
                src={photo.src || '/placeholder.svg'}
                alt={photo.alt}
                width={400}
                height={520}
                className="aspect-[3/4] w-full object-cover"
              />
            </div>
          ))}
        </div>
      </section>
      <footer className="text-center text-sm text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-4">
          प्राइवेसी पॉलिसी
        </Link>
      </footer>
      <BottomNav active="home" />
    </main>
  )
}
