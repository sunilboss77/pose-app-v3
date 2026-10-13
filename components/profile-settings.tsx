'use client'

import Link from 'next/link'
import { Check, Clock3, Crown, Home, Sparkles, UserRound, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/lib/subscription-plans'

const PROFILE_STORAGE_KEY = 'pose-guide-profile'

type AvatarId = 'sun' | 'cloud' | 'flower' | 'moon'

type Profile = {
  name: string
  avatar: AvatarId
}

const AVATARS: Array<{ id: AvatarId; label: string; colors: [string, string] }> = [
  { id: 'sun', label: 'Sunny', colors: ['#fbbf24', '#fb7185'] },
  { id: 'cloud', label: 'Cloudy', colors: ['#60a5fa', '#c4b5fd'] },
  { id: 'flower', label: 'Bloom', colors: ['#f472b6', '#fb923c'] },
  { id: 'moon', label: 'Moon', colors: ['#818cf8', '#38bdf8'] },
]

function Avatar({ id, size = 'md' }: { id: AvatarId; size?: 'sm' | 'md' | 'lg' }) {
  const gradientId = useId()
  const avatar = AVATARS.find((option) => option.id === id) ?? AVATARS[0]
  const dimensions = size === 'lg' ? 92 : size === 'sm' ? 42 : 64

  return (
    <svg width={dimensions} height={dimensions} viewBox="0 0 92 92" role="img" aria-label={`${avatar.label} avatar`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={avatar.colors[0]} />
          <stop offset="1" stopColor={avatar.colors[1]} />
        </linearGradient>
      </defs>
      <circle cx="46" cy="46" r="45" fill={`url(#${gradientId})`} />
      {id === 'sun' && <><circle cx="46" cy="46" r="25" fill="#fff7c2" /><path d="M46 13v9M46 70v9M13 46h9M70 46h9M23 23l7 7M62 62l7 7M69 23l-7 7M30 62l-7 7" stroke="#fff7c2" strokeWidth="5" strokeLinecap="round" /></>}
      {id === 'cloud' && <><path d="M23 58h47a12 12 0 0 0 1-24 20 20 0 0 0-38-3A14 14 0 0 0 23 58Z" fill="#eff6ff" /><circle cx="39" cy="47" r="3" fill="#1e3a8a" /><circle cx="56" cy="47" r="3" fill="#1e3a8a" /><path d="M42 55q4 4 8 0" fill="none" stroke="#1e3a8a" strokeWidth="2.5" strokeLinecap="round" /></>}
      {id === 'flower' && <><circle cx="46" cy="49" r="17" fill="#fff1f2" /><circle cx="31" cy="32" r="12" fill="#fce7f3" /><circle cx="61" cy="32" r="12" fill="#fce7f3" /><circle cx="29" cy="57" r="12" fill="#fce7f3" /><circle cx="63" cy="57" r="12" fill="#fce7f3" /><circle cx="40" cy="48" r="2.5" fill="#831843" /><circle cx="52" cy="48" r="2.5" fill="#831843" /><path d="M42 56q4 3 8 0" fill="none" stroke="#831843" strokeWidth="2.5" strokeLinecap="round" /></>}
      {id === 'moon' && <><path d="M61 18a29 29 0 1 0 12 47A25 25 0 1 1 61 18Z" fill="#eef2ff" /><circle cx="31" cy="34" r="2.5" fill="#3730a3" /><circle cx="51" cy="61" r="2" fill="#3730a3" /><path d="m24 52 3 4 3-4-3-4-3 4Z" fill="#fff" /></>}
    </svg>
  )
}

export function BottomNav({ active }: { active: 'home' | 'me' }) {
  return (
    <nav
      aria-label="मुख्य नेविगेशन"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md justify-around border-t border-border bg-background/95 px-6 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur"
      style={{ paddingBottom: 'max(0.6rem, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
    >
      <Link href="/" aria-current={active === 'home' ? 'page' : undefined} className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-1 text-xs ${active === 'home' ? 'text-primary' : 'text-muted-foreground'}`}>
        <Home className="size-5" aria-hidden="true" />
        <span>Home</span>
      </Link>
      <Link href="/me" aria-current={active === 'me' ? 'page' : undefined} className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-1 text-xs ${active === 'me' ? 'text-primary' : 'text-muted-foreground'}`}>
        <UserRound className="size-5" aria-hidden="true" />
        <span>Me</span>
      </Link>
    </nav>
  )
}

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${plan.accent}`} aria-hidden="true" />
            <h3 className="font-semibold">{plan.name}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{plan.regularMinutes} min Gemini guidance</p>
        </div>
        <p className="text-right text-sm font-semibold">₹{plan.regularPrice}</p>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-background/70 p-2 text-xs">
        <div><p className="text-muted-foreground">Intro</p><p className="font-medium">₹{plan.introPrice} · {plan.introMinutes} min</p></div>
        <div><p className="text-muted-foreground">Regular</p><p className="font-medium">₹{plan.regularPrice} · {plan.regularMinutes} min</p></div>
      </div>
      <button type="button" disabled className="w-full rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-90">
        Play Store purchase will be connected in the next billing phase
      </button>
    </article>
  )
}

export function PaywallDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      className="fixed inset-0 m-auto max-h-svh w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl border border-border bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/70"
      aria-labelledby="premium-title"
      style={{
        paddingTop: 'max(1.25rem, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
        paddingBottom: 'max(1.25rem, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        paddingLeft: 'max(1.25rem, var(--safe-area-inset-left, env(safe-area-inset-left, 0px)))',
        paddingRight: 'max(1.25rem, var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))',
      }}
    >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-primary"><Crown className="size-4" aria-hidden="true" /> Premium preview</p>
            <h2 id="premium-title" className="text-2xl font-bold">Gemini guidance plans</h2>
            <p className="mt-1 text-sm text-muted-foreground">See what is planned. Free camera use stays available.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close premium preview">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" /> Gemini benefits preview</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {['Pose suggestions for your scene', 'Friendly live guidance', 'Photo feedback after a pose'].map((benefit) => <li key={benefit} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{benefit}</li>)}
            </ul>
          </div>
          <div className="rounded-xl bg-background p-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-primary" aria-hidden="true" /> Remaining time</p>
            <p className="mt-3 text-2xl font-bold">0 min</p>
            <p className="text-xs text-muted-foreground">Preview only · no paid time or entitlement is active</p>
          </div>
        </div>

        <div className="space-y-3">
          {SUBSCRIPTION_PLANS.map((plan) => <PlanCard key={plan.name} plan={plan} />)}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Play Store purchase will be connected in the next billing phase.</p>
        <Link href="/privacy" onClick={onClose} className="mt-3 block text-center text-xs text-muted-foreground underline underline-offset-4">Privacy policy</Link>
    </dialog>
  )
}

export function PremiumBanner() {
  const [open, setOpen] = useState(false)

  return <>
    <section className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3" aria-label="Premium preview">
      <div className="flex items-center gap-3"><span className="rounded-full bg-primary/20 p-2"><Sparkles className="size-4 text-primary" aria-hidden="true" /></span><div><p className="text-sm font-semibold">Gemini guidance preview</p><p className="text-xs text-muted-foreground">Plans and minutes, coming soon</p></div></div>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">See plans</button>
    </section>
    {open && <PaywallDialog onClose={() => setOpen(false)} />}
  </>
}

export function ProfileSettings() {
  const [profile, setProfile] = useState<Profile>({ name: '', avatar: 'sun' })
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [paywallOpen, setPaywallOpen] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY)
      if (!stored) return
      const parsed: unknown = JSON.parse(stored)
      if (!parsed || typeof parsed !== 'object' || !('name' in parsed) || !('avatar' in parsed)) return
      const avatar = AVATARS.some((option) => option.id === parsed.avatar) ? parsed.avatar as AvatarId : 'sun'
      setProfile({ name: typeof parsed.name === 'string' ? parsed.name.slice(0, 40) : '', avatar })
    } catch {
      setMessage('Your saved profile could not be read. You can try saving again.')
    } finally {
      setReady(true)
    }
  }, [])

  function saveProfile() {
    try {
      const nextProfile = { ...profile, name: profile.name.trim() }
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile))
      setProfile(nextProfile)
      setMessage('Saved on this device ✓')
    } catch {
      setMessage('Could not save on this device. Please allow local storage and try again.')
    }
  }

  return <>
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-4 pb-28 pt-12" style={{
      paddingTop: 'max(3rem, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))',
      paddingBottom: 'calc(6rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
      paddingLeft: 'max(1rem, var(--safe-area-inset-left, env(safe-area-inset-left, 0px)))',
      paddingRight: 'max(1rem, var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))',
    }}>
      <header><p className="text-sm text-muted-foreground">अपनी पसंद सेव करें</p><h1 className="text-3xl font-bold">Me</h1><p className="mt-1 text-sm text-muted-foreground">No login needed · saved only on this device</p></header>
      <section className="rounded-3xl border border-border bg-card p-5" aria-labelledby="profile-heading">
        <div className="mb-5 flex items-center gap-4"><Avatar id={profile.avatar} size="lg" /><div><h2 id="profile-heading" className="font-semibold">Your profile</h2><p className="text-sm text-muted-foreground">Make your guide feel like yours.</p></div></div>
        <label htmlFor="profile-name" className="text-sm font-medium">Name</label>
        <input
          id="profile-name"
          value={profile.name}
          disabled={!ready}
          onChange={(event) => { setProfile((current) => ({ ...current, name: event.target.value })); setMessage('') }}
          placeholder="आपका नाम"
          autoComplete="nickname"
          maxLength={40}
          className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
        />
        <fieldset disabled={!ready} className="mt-5">
          <legend className="mb-3 text-sm font-medium">Choose an avatar</legend>
          <div className="grid grid-cols-4 gap-2">
            {AVATARS.map((avatar) => (
              <label key={avatar.id} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="profile-avatar"
                  value={avatar.id}
                  checked={profile.avatar === avatar.id}
                  onChange={() => { setProfile((current) => ({ ...current, avatar: avatar.id })); setMessage('') }}
                  className="peer sr-only"
                />
                <span className="flex flex-col items-center gap-1 rounded-2xl bg-background p-2 peer-checked:bg-primary/15 peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring">
                  <Avatar id={avatar.id} size="sm" />
                  <span className="text-[11px] text-muted-foreground">{avatar.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" disabled={!ready} onClick={saveProfile} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save locally</button>
        <p role="status" className="mt-2 text-sm text-muted-foreground">{message}</p>
      </section>
      <button type="button" onClick={() => setPaywallOpen(true)} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 text-left"><span><span className="block text-sm font-semibold">Explore Gemini plans</span><span className="text-xs text-muted-foreground">Display-only preview · billing comes later</span></span><Crown className="size-5 text-primary" aria-hidden="true" /></button>
      <Link href="/privacy" className="text-center text-sm text-muted-foreground underline underline-offset-4">प्राइवेसी पॉलिसी</Link>
    </main>
    <BottomNav active="me" />
    {paywallOpen && <PaywallDialog onClose={() => setPaywallOpen(false)} />}
  </>
}
