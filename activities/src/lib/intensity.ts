import type { Activity } from '../types'

/** Z1–Z2 easy, Z3 medium, Z4–Z5 hard. */
export type Intensity = 'easy' | 'medium' | 'hard'

export const INTENSITY_LABEL: Record<Intensity, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

export const INTENSITY_COLOR: Record<Intensity, string> = {
  easy: '#1F6F8B',
  medium: '#FACC15',
  hard: '#DC2626',
}

export const INTENSITY_CELL: Record<Intensity, { bg: string; fg: string; bars: [number, number, number] }> = {
  easy: { bg: '#1F6F8B', fg: '#FFFFFF', bars: [1, 0.3, 0.3] },
  medium: { bg: '#FACC15', fg: '#1A1205', bars: [1, 1, 0.3] },
  hard: { bg: '#DC2626', fg: '#FFFFFF', bars: [1, 1, 1] },
}

const RANK: Record<Intensity, number> = { easy: 0, medium: 1, hard: 2 }

export const DEFAULT_MAX_HR = 200
const MAX_HR_KEY = 'enduraw.hrMax'
const MAX_HR_MIN = 100
const MAX_HR_MAX = 230

export function clampMaxHr(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_HR
  return Math.min(MAX_HR_MAX, Math.max(MAX_HR_MIN, Math.round(value)))
}

export function loadMaxHr(): number {
  try {
    const raw = localStorage.getItem(MAX_HR_KEY)
    if (raw === null || raw.trim() === '') return DEFAULT_MAX_HR
    return clampMaxHr(Number(raw))
  } catch {
    return DEFAULT_MAX_HR
  }
}

export function saveMaxHr(value: number): number {
  const next = clampMaxHr(value)
  try {
    localStorage.setItem(MAX_HR_KEY, String(next))
  } catch {
    /* the value still applies for this visit */
  }
  return next
}

/** Z1 under 60% of max, then 10-point steps through Z5 at 90% and above. */
export function heartRateZone(hr: number, maxHr: number): number {
  const ratio = hr / maxHr
  if (ratio < 0.6) return 1
  if (ratio < 0.7) return 2
  if (ratio < 0.8) return 3
  if (ratio < 0.9) return 4
  return 5
}

function bucket(zoneNumber: number): Intensity {
  if (zoneNumber <= 2) return 'easy'
  if (zoneNumber === 3) return 'medium'
  return 'hard'
}

/** Same Z1–Z5 cutoffs as a calendar day: under 70% easy, 70–80% medium, 80% and above hard. */
export function intensityFromHeartRate(hr: number, maxHr: number | null): Intensity | null {
  if (!maxHr || hr <= 0) return null
  return bucket(heartRateZone(hr, maxHr))
}

/** Dominant zone from the stream, otherwise the average heart rate. */
export function intensityOf(activity: Activity, maxHr: number | null): Intensity | null {
  if (!maxHr) return null
  const samples = (activity.stream ?? []).map((point) => point.hr).filter((hr): hr is number => hr !== null && hr > 0)
  if (samples.length >= 8) {
    const counts = [0, 0, 0, 0, 0]
    for (const hr of samples) counts[heartRateZone(hr, maxHr) - 1] += 1
    let dominant = 0
    for (let index = 1; index < counts.length; index += 1) {
      if (counts[index] > counts[dominant]) dominant = index
    }
    return bucket(dominant + 1)
  }
  if (activity.avgHr && activity.avgHr > 0) return bucket(heartRateZone(activity.avgHr, maxHr))
  return null
}

export function harder(current: Intensity | null, next: Intensity | null): Intensity | null {
  if (!next) return current
  if (!current) return next
  return RANK[next] > RANK[current] ? next : current
}
