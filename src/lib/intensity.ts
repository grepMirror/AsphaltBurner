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
const MAX_HR_KEY = 'asphaltburner.hrMax'
const ZONE_KEY = 'asphaltburner.zoneEdges'
const MAX_HR_MIN = 100
const MAX_HR_MAX = 230

/** Upper bounds, in percent of max heart rate, for Z1, Z2, Z3 and Z4. Z5 is everything above the last. */
export type ZoneEdges = readonly [number, number, number, number]

export const DEFAULT_ZONES: ZoneEdges = [60, 70, 80, 90]

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

export function clampZones(values: readonly number[]): ZoneEdges {
  const next: number[] = []
  let previous = 39
  for (let index = 0; index < 4; index += 1) {
    const raw = Number.isFinite(values[index]) ? Math.round(values[index]) : DEFAULT_ZONES[index]
    const value = Math.min(99 - (3 - index), Math.max(previous + 1, raw))
    next.push(value)
    previous = value
  }
  return next as unknown as ZoneEdges
}

export function loadZones(): ZoneEdges {
  try {
    const raw = localStorage.getItem(ZONE_KEY)
    if (!raw) return DEFAULT_ZONES
    return clampZones(raw.split(',').map(Number))
  } catch {
    return DEFAULT_ZONES
  }
}

export function saveZones(values: readonly number[]): ZoneEdges {
  const next = clampZones(values)
  try {
    localStorage.setItem(ZONE_KEY, next.join(','))
  } catch {
    /* the value still applies for this visit */
  }
  return next
}

/** Zone from the configured percent-of-max boundaries. */
export function heartRateZone(hr: number, maxHr: number, zones: ZoneEdges = DEFAULT_ZONES): number {
  const ratio = (hr / maxHr) * 100
  for (let index = 0; index < zones.length; index += 1) {
    if (ratio < zones[index]) return index + 1
  }
  return 5
}

function intensityOfZone(zone: number): Intensity {
  if (zone <= 2) return 'easy'
  if (zone === 3) return 'medium'
  return 'hard'
}

export function intensityFromHeartRate(hr: number, maxHr: number | null, zones: ZoneEdges = DEFAULT_ZONES): Intensity | null {
  if (!maxHr || hr <= 0) return null
  return intensityOfZone(heartRateZone(hr, maxHr, zones))
}

/** Dominant band from the stream, otherwise the average heart rate. */
export function intensityOf(activity: Activity, maxHr: number | null, zones: ZoneEdges = DEFAULT_ZONES): Intensity | null {
  if (!maxHr) return null
  const samples = (activity.stream ?? []).map((point) => point.hr).filter((hr): hr is number => hr !== null && hr > 0)
  if (samples.length >= 8) {
    const counts: Record<Intensity, number> = { easy: 0, medium: 0, hard: 0 }
    for (const hr of samples) {
      const level = intensityFromHeartRate(hr, maxHr, zones)
      if (level) counts[level] += 1
    }
    return (['easy', 'medium', 'hard'] as const).reduce((best, level) => (counts[level] > counts[best] ? level : best))
  }
  if (activity.avgHr && activity.avgHr > 0) return intensityFromHeartRate(activity.avgHr, maxHr, zones)
  return null
}

export function harder(current: Intensity | null, next: Intensity | null): Intensity | null {
  if (!next) return current
  if (!current) return next
  return RANK[next] > RANK[current] ? next : current
}
