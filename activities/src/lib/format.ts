import type { Activity, Sport } from '../types'

export const SPORTS: Sport[] = ['run', 'swim', 'ride', 'other']

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Run',
  swim: 'Swim',
  ride: 'Ride',
  other: 'Other',
}

export const SPORT_COLOR: Record<Sport, string> = {
  run: '#38bdf8',
  swim: '#2dd4bf',
  ride: '#fbbf24',
  other: '#94a3b8',
}

/** Trail sessions are runs. Older saved bundles may still say `trail`. */
export function normalizeSport(sport: string): Sport {
  if (sport === 'run' || sport === 'trail') return 'run'
  if (sport === 'swim') return 'swim'
  if (sport === 'ride') return 'ride'
  return 'other'
}

export function formatDistance(meters: number): string {
  const km = meters / 1000
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export function formatHours(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 10) return `${hours.toFixed(1)} h`
  return `${Math.round(hours)} h`
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h <= 0) return `${m} min`
  return `${h}h ${String(m).padStart(2, '0')}`
}

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatPaceOrSpeed(activity: Activity): string {
  if (activity.distanceM <= 0 || activity.movingSec <= 0) return '—'
  if (activity.sport === 'ride') {
    const kmh = activity.distanceM / 1000 / (activity.movingSec / 3600)
    return `${kmh.toFixed(1)} km/h`
  }
  const secPerKm = activity.movingSec / (activity.distanceM / 1000)
  const minutes = Math.floor(secPerKm / 60)
  const seconds = Math.round(secPerKm % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`
}
