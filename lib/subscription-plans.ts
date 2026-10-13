export type SubscriptionPlan = {
  name: 'Ultra' | 'Pro' | 'Platinum' | 'Max'
  regularPrice: number
  introPrice: number
  introMinutes: number
  regularMinutes: number
  accent: string
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { name: 'Ultra', regularPrice: 99, introPrice: 9, introMinutes: 5, regularMinutes: 45, accent: 'bg-sky-400' },
  { name: 'Pro', regularPrice: 149, introPrice: 15, introMinutes: 15, regularMinutes: 120, accent: 'bg-violet-400' },
  { name: 'Platinum', regularPrice: 299, introPrice: 30, introMinutes: 30, regularMinutes: 360, accent: 'bg-fuchsia-400' },
  { name: 'Max', regularPrice: 599, introPrice: 60, introMinutes: 60, regularMinutes: 900, accent: 'bg-amber-300' },
]
