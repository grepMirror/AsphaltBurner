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
export const DEFAULT_REST_HR = 60
const MAX_HR_KEY = 'asphaltburner.hrMax'
const REST_HR_KEY = 'asphaltburner.hrRest'
const METHOD_KEY = 'asphaltburner.hrMethod'
const ZONE_KEY = 'asphaltburner.zoneEdges'
const MAX_HR_MIN = 100
const MAX_HR_MAX = 230
const REST_HR_MIN = 30
const REST_HR_MAX = 100

/** Upper bounds, in percent of max heart rate, for Z1, Z2, Z3 and Z4. Z5 is everything above the last. */
export type ZoneEdges = readonly [number, number, number, number]

export const DEFAULT_ZONES: ZoneEdges = [60, 70, 80, 90]

/** `max` is a percent of max heart rate. `karvonen` is a percent of heart-rate reserve. */
export type HrMethod = 'max' | 'karvonen'

export type HrBasis = {
  restHr: number
  method: HrMethod
}

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

export function clampRestHr(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REST_HR
  return Math.min(REST_HR_MAX, Math.max(REST_HR_MIN, Math.round(value)))
}

export function loadRestHr(): number {
  try {
    const raw = localStorage.getItem(REST_HR_KEY)
    if (raw === null || raw.trim() === '') return DEFAULT_REST_HR
    return clampRestHr(Number(raw))
  } catch {
    return DEFAULT_REST_HR
  }
}

export function saveRestHr(value: number): number {
  const next = clampRestHr(value)
  try {
    localStorage.setItem(REST_HR_KEY, String(next))
  } catch {
    /* the value still applies for this visit */
  }
  return next
}

/** Resting rate used for heart-rate reserve. Stays at least 30 bpm under max. */
export function reserveRest(maxHr: number, restHr: number): number {
  return Math.min(clampRestHr(restHr), maxHr - 30)
}

/** Karvonen is the default. `max` only applies when the user picked it, since it is only stored on an explicit choice. */
export const DEFAULT_HR_METHOD: HrMethod = 'karvonen'

export function loadHrMethod(): HrMethod {
  try {
    return localStorage.getItem(METHOD_KEY) === 'max' ? 'max' : DEFAULT_HR_METHOD
  } catch {
    return DEFAULT_HR_METHOD
  }
}

export function saveHrMethod(value: HrMethod): HrMethod {
  const next: HrMethod = value === 'max' ? 'max' : 'karvonen'
  try {
    localStorage.setItem(METHOD_KEY, next)
  } catch {
    /* the value still applies for this visit */
  }
  return next
}

function zoneRatio(hr: number, maxHr: number, basis?: HrBasis): number {
  if (basis?.method !== 'karvonen') return (hr / maxHr) * 100
  const rest = reserveRest(maxHr, basis.restHr)
  return ((hr - rest) / (maxHr - rest)) * 100
}

/** Upper bpm of Z1–Z4 for the active method. */
export function zoneCutBpm(maxHr: number, zones: ZoneEdges, basis?: HrBasis): number[] {
  return zones.map((percent) => {
    if (basis?.method !== 'karvonen') return (maxHr * percent) / 100
    const rest = reserveRest(maxHr, basis.restHr)
    return rest + ((maxHr - rest) * percent) / 100
  })
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

/** Zone from the configured percents. Karvonen uses heart-rate reserve instead of max. */
export function heartRateZone(hr: number, maxHr: number, zones: ZoneEdges = DEFAULT_ZONES, basis?: HrBasis): number {
  const ratio = zoneRatio(hr, maxHr, basis)
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

export function intensityFromHeartRate(hr: number, maxHr: number | null, zones: ZoneEdges = DEFAULT_ZONES, basis?: HrBasis): Intensity | null {
  if (!maxHr || hr <= 0) return null
  return intensityOfZone(heartRateZone(hr, maxHr, zones, basis))
}

/** A run is hard when Z4+Z5 is at least this share of its heart-rate time. */
export const HARD_SHARE = 0.25
/** Otherwise it is medium when Z3 and above reach this share. Below it, the run is easy. */
export const MEDIUM_SHARE = 0.45
/** Under this much heart-rate time the stream is too short to judge, so the average heart rate is used. */
const MIN_HR_SECONDS = 600
/** A gap longer than this between samples is not counted as time spent at that heart rate. */
const MAX_SPAN_SEC = 180
const MIN_HR_SAMPLES = 8

/**
 * Easy, medium or hard from the time spent in each zone. Each sample counts for the seconds until the next one.
 * Hard: Z4+Z5 at least HARD_SHARE. Medium: Z3 and above at least MEDIUM_SHARE. Otherwise easy.
 * Falls back to the average heart rate when the stream is too short.
 */
export function intensityOf(activity: Activity, maxHr: number | null, zones: ZoneEdges = DEFAULT_ZONES, basis?: HrBasis): Intensity | null {
  if (!maxHr) return null
  const stream = activity.stream ?? []
  const hrSamples = stream.filter((point) => point.hr !== null && point.hr > 0).length
  if (hrSamples >= MIN_HR_SAMPLES) {
    let total = 0
    let medium = 0
    let hard = 0
    for (let index = 0; index < stream.length - 1; index += 1) {
      const point = stream[index]
      const span = stream[index + 1].t - point.t
      if (point.hr === null || point.hr <= 0 || span <= 0 || span > MAX_SPAN_SEC) continue
      total += span
      const zone = heartRateZone(point.hr, maxHr, zones, basis)
      if (zone >= 4) hard += span
      if (zone >= 3) medium += span
    }
    if (total >= MIN_HR_SECONDS) {
      if (hard / total >= HARD_SHARE) return 'hard'
      if (medium / total >= MEDIUM_SHARE) return 'medium'
      return 'easy'
    }
  }
  if (activity.avgHr && activity.avgHr > 0) return intensityFromHeartRate(activity.avgHr, maxHr, zones, basis)
  return null
}

export function harder(current: Intensity | null, next: Intensity | null): Intensity | null {
  if (!next) return current
  if (!current) return next
  return RANK[next] > RANK[current] ? next : current
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('intensity.ts')) {
  const KARVONEN = { restHr: 60, method: 'karvonen' as const }
  // Each segment is [seconds, hr]; a sample every 10 s, so a segment of N seconds holds N/10 samples.
  const run = (segments: [number, number][], avgHr: number | null = null): Activity => {
    const stream: { t: number; d: number; alt: null; hr: number; cad: null; speed: null }[] = []
    let t = 0
    for (const [seconds, hr] of segments) {
      for (let at = 0; at < seconds; at += 10) {
        stream.push({ t, d: 0, alt: null, hr, cad: null, speed: null })
        t += 10
      }
    }
    return { id: 'test', name: 'test', type: 'Run', sport: 'run', date: '2026-01-01T00:00:00.000Z', movingSec: t, elapsedSec: t, distanceM: 0, elevationM: 0, avgHr, track: [], stream }
  }
  const judge = (activity: Activity) => intensityOf(activity, 201, DEFAULT_ZONES, KARVONEN)
  // Karvonen cut-offs at max 201, rest 60: Z3 starts at 159, Z4 at 173, Z5 at 187. 130 is Z1, 135 Z1, 165 Z3, 185 Z4.
  if (judge(run([[1200, 185], [1200, 130]])) !== 'hard') throw new Error('half Z4 is hard')
  if (judge(run([[1200, 165], [1200, 130]])) !== 'medium') throw new Error('half Z3 is medium')
  if (judge(run([[600, 165], [1800, 130]])) !== 'easy') throw new Error('25% Z3 stays easy')
  if (judge(run([[2400, 135]])) !== 'easy') throw new Error('all Z1 is easy')
  // 5 min is too short to judge: the average heart rate decides.
  if (judge(run([[300, 185], [0, 130]], 130)) !== 'easy') throw new Error('short run uses avg hr')
  if (judge(run([[300, 185]], 185)) !== 'hard') throw new Error('short run avg hr hard')
  // A quarter of Z4+ exactly counts as hard.
  if (judge(run([[600, 185], [1800, 130]])) !== 'hard') throw new Error('25% Z4 is hard')
}
