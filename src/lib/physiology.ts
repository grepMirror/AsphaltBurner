import type { Activity, StreamPoint } from '../types'
import { ZONE_BANDS, type ZoneStyle } from './load'
import { DEFAULT_ZONES, reserveRest, type ZoneEdges } from './intensity'

const BIN_KMH = 0.25
const GAP_CAP_SEC = 180
const HR_BIN = 2
const DAY_MS = 24 * 60 * 60 * 1000

/** Seconds in a speed bin before the band is drawn. Less than this stays a faded line. */
export const PACE_SOLID_SEC = 60
/** Slower than 8:00/km stays off the default axis. 8:00/km is 7.5 km/h. */
export const PACE_FLOOR_KMH = 7.5

export type PaceSpan = '30d' | '90d' | '1y'
export type PaceCompare = 'previous' | 'year'

export type PacePoint = {
  speed: number
  p25: number | null
  p75: number | null
  median: number | null
  /** Seconds this speed bin stands for. */
  n: number
  /** Kept stream points in this bin. */
  samples: number
}

export type PaceCost = {
  retained: number
  used: number
  bands: number
  /** Beats one extra km/h costs, from the median of each speed bin. */
  slope: number | null
  points: PacePoint[]
}

export type HrBin = {
  hr: number
  seconds: number
}

export type ZoneSlice = {
  key: string
  label: string
  color: string
  from: number | null
  to: number | null
  seconds: number
}

function runsOf(activities: Activity[]): Activity[] {
  return activities
    .filter((activity) => activity.sport === 'run')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

function readingSpeed(stream: StreamPoint[], index: number): number | null {
  const point = stream[index]
  if (point.speed !== null && point.speed > 0) return point.speed
  const previous = stream[index - 1]
  if (!previous) return null
  const distance = point.d - previous.d
  const seconds = point.t - previous.t
  if (distance > 1 && seconds > 0) return distance / seconds
  return null
}

/** Running speed with a plausible pace, same window as the session charts. */
function runningSpeed(speed: number): number | null {
  if (speed <= 0.7) return null
  const pace = 1000 / speed
  if (pace < 140 || pace > 900) return null
  return speed * 3.6
}

function validHr(hr: number | null): hr is number {
  return hr !== null && hr >= 40 && hr <= 230
}

function weightedQuantile(samples: { hr: number; w: number }[], q: number): number {
  const sorted = samples.slice().sort((a, b) => a.hr - b.hr)
  let total = 0
  for (const sample of sorted) total += sample.w
  let seen = 0
  const target = total * q
  for (const sample of sorted) {
    seen += sample.w
    if (seen >= target) return sample.hr
  }
  return sorted[sorted.length - 1].hr
}

/** Pace against heart rate. Each kept sample stands for the seconds until the next one, so a long run outweighs a short one. */
export function buildPaceCost(activities: Activity[]): PaceCost {
  const groups = new Map<number, { hr: number; w: number }[]>()
  let seconds = 0
  for (const activity of runsOf(activities)) {
    const stream = activity.stream ?? []
    for (let index = 0; index < stream.length - 1; index += 1) {
      const span = stream[index + 1].t - stream[index].t
      if (span <= 0 || span > GAP_CAP_SEC) continue
      const speed = readingSpeed(stream, index)
      const hr = stream[index].hr
      if (speed === null || !validHr(hr)) continue
      const kmh = runningSpeed(speed)
      if (kmh === null) continue
      const bin = Math.round(kmh / BIN_KMH)
      const sample = { hr, w: span }
      const list = groups.get(bin)
      if (list) list.push(sample)
      else groups.set(bin, [sample])
      seconds += span
    }
  }
  const occupied = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bin, list]) => {
      const weight = list.reduce((sum, sample) => sum + sample.w, 0)
      return {
        speed: bin * BIN_KMH,
        p25: weightedQuantile(list, 0.25),
        median: weightedQuantile(list, 0.5),
        p75: weightedQuantile(list, 0.75),
        n: weight,
        samples: list.length,
      }
    })

  const points: PacePoint[] = []
  if (occupied.length > 0) {
    const byBin = new Map(occupied.map((band) => [Math.round(band.speed / BIN_KMH), band]))
    const first = Math.round(occupied[0].speed / BIN_KMH)
    const last = Math.round(occupied[occupied.length - 1].speed / BIN_KMH)
    for (let bin = first; bin <= last; bin += 1) {
      points.push(byBin.get(bin) ?? { speed: bin * BIN_KMH, p25: null, p75: null, median: null, n: 0, samples: 0 })
    }
  }

  const solid = occupied.filter((band) => band.n >= PACE_SOLID_SEC)
  return { retained: seconds, used: seconds, bands: solid.length, slope: medianSlope(solid), points }
}

export function paceWindows(span: PaceSpan, compare: PaceCompare, now: number) {
  const days = span === '30d' ? 30 : span === '90d' ? 90 : 365
  const length = days * DAY_MS
  const start = now - length
  const compareEnd = compare === 'previous' ? start : now - 365 * DAY_MS
  return { start, end: now, compareStart: compareEnd - length, compareEnd }
}

export type PaceRow = {
  speed: number
  p25: number | null
  iqr: number | null
  median: number | null
  medianThin: number | null
  before: number | null
  beforeThin: number | null
  n: number
  samples: number
  beforeSamples: number
}

/** Current period keeps the band. The other period is only a median. Slower than 8:00/km and the thin fast tail drop out unless allSpeeds. */
export function paceRows(current: PacePoint[], prior: PacePoint[], allSpeeds: boolean): PaceRow[] {
  const nowBySpeed = new Map(current.map((point) => [point.speed, point]))
  const priorBySpeed = new Map(prior.map((point) => [point.speed, point]))
  const speeds = [...new Set<number>([...nowBySpeed.keys(), ...priorBySpeed.keys()])].sort((a, b) => a - b)
  let cap = Infinity
  if (!allSpeeds) {
    const solid = current.filter((point) => point.speed >= PACE_FLOOR_KMH && point.n >= PACE_SOLID_SEC)
    cap = solid.length ? solid[solid.length - 1].speed : Infinity
  }
  const rows: PaceRow[] = []
  for (const speed of speeds) {
    if (!allSpeeds && (speed < PACE_FLOOR_KMH || speed > cap)) continue
    const now = nowBySpeed.get(speed)
    const was = priorBySpeed.get(speed)
    const nowSolid = (now?.n ?? 0) >= PACE_SOLID_SEC && now?.median != null
    const wasSolid = (was?.n ?? 0) >= PACE_SOLID_SEC && was?.median != null
    rows.push({
      speed,
      p25: nowSolid ? now!.p25 : null,
      iqr: nowSolid && now!.p25 != null && now!.p75 != null ? now!.p75 - now!.p25 : null,
      median: nowSolid ? now!.median : null,
      medianThin: !nowSolid && now && now.n > 0 ? now.median : null,
      before: wasSolid ? was!.median : null,
      beforeThin: !wasSolid && was && was.n > 0 ? was.median : null,
      n: now?.n ?? 0,
      samples: now?.samples ?? 0,
      beforeSamples: was?.samples ?? 0,
    })
  }
  return rows
}

function medianSlope(bands: { speed: number; median: number; n: number }[]): number | null {
  if (bands.length < 2) return null
  let weight = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const band of bands) {
    weight += band.n
    sx += band.n * band.speed
    sy += band.n * band.median
    sxx += band.n * band.speed * band.speed
    sxy += band.n * band.speed * band.median
  }
  const denom = weight * sxx - sx * sx
  if (denom === 0) return null
  return (weight * sxy - sx * sy) / denom
}

/** Seconds in each 2 bpm bin. Time is the gap to the next valid heart-rate sample. */
export function buildHrBins(activities: Activity[]): HrBin[] {
  const seconds = new Map<number, number>()
  for (const activity of runsOf(activities)) {
    const stream = activity.stream ?? []
    for (let index = 0; index < stream.length - 1; index += 1) {
      const current = stream[index]
      const next = stream[index + 1]
      const span = next.t - current.t
      if (span <= 0 || span > GAP_CAP_SEC) continue
      if (!validHr(current.hr) || !validHr(next.hr)) continue
      const bin = Math.floor(current.hr / HR_BIN) * HR_BIN
      seconds.set(bin, (seconds.get(bin) ?? 0) + span)
    }
  }
  if (seconds.size === 0) return []
  const keys = [...seconds.keys()]
  const bins: HrBin[] = []
  for (let hr = Math.min(...keys); hr <= Math.max(...keys); hr += HR_BIN) bins.push({ hr, seconds: seconds.get(hr) ?? 0 })
  return bins
}

export function reserveCuts(maxHr: number, restHr: number, zones: ZoneEdges = DEFAULT_ZONES): number[] {
  const rest = reserveRest(maxHr, restHr)
  const span = maxHr - rest
  return zones.map((percent) => rest + (span * percent) / 100)
}

export function reserveZone(hr: number, cuts: number[]): number {
  for (let index = 0; index < cuts.length; index += 1) {
    if (hr < cuts[index]) return index + 1
  }
  return cuts.length + 1
}

export function styleKey(zone: number, style: ZoneStyle): string {
  if (style === '5') return `z${zone}`
  if (zone <= 2) return 'easy'
  if (zone === 3) return 'medium'
  return 'hard'
}

export function zoneSlices(bins: HrBin[], style: ZoneStyle, maxHr: number, restHr: number, zones: ZoneEdges = DEFAULT_ZONES): ZoneSlice[] {
  const cuts = reserveCuts(maxHr, restHr, zones)
  const bands = ZONE_BANDS[style]
  const seconds = bands.map(() => 0)
  for (const bin of bins) {
    const key = styleKey(reserveZone(bin.hr + 1, cuts), style)
    const index = bands.findIndex((band) => band.key === key)
    if (index >= 0) seconds[index] += bin.seconds
  }
  const edges = style === '5' ? cuts : [cuts[1], cuts[2]]
  return bands.map((band, index) => ({
    key: band.key,
    label: band.label,
    color: band.color,
    from: index === 0 ? null : edges[index - 1],
    to: index === bands.length - 1 ? null : edges[index],
    seconds: seconds[index],
  }))
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('physiology.ts')) {
  const stream = (points: { t: number; hr: number | null; speed: number }[]): StreamPoint[] =>
    points.map((point) => ({ t: point.t, d: point.t * point.speed, alt: null, hr: point.hr, cad: null, speed: point.speed }))
  const run = (sport: Activity['sport'], points: { t: number; hr: number | null; speed: number }[]): Activity => ({
    id: sport,
    name: sport,
    type: 'Run',
    sport,
    date: '2026-01-01T00:00:00.000Z',
    movingSec: 100,
    elapsedSec: 100,
    distanceM: 1000,
    elevationM: 0,
    avgHr: 150,
    track: [],
    stream: stream(points),
  })
  const slow = Array.from({ length: 70 }, (_, index) => ({ t: index, hr: 150, speed: 3 }))
  const fast = Array.from({ length: 70 }, (_, index) => ({ t: index, hr: 170, speed: 4 }))
  const pace = buildPaceCost([
    run('run', slow),
    run('run', fast),
    run('ride', [{ t: 0, hr: 100, speed: 8 }]),
    run('run', [{ t: 0, hr: 150, speed: 0.2 }]),
  ])
  if (pace.bands !== 2 || pace.slope === null || Math.abs(pace.slope - 20 / 3.75) > 0.05) {
    throw new Error(`pace bands ${pace.bands} slope ${pace.slope}`)
  }
  const weighted = buildPaceCost([
    run('run', [
      { t: 0, hr: 100, speed: 3 },
      { t: 1, hr: 140, speed: 3 },
      { t: 10, hr: 140, speed: 3 },
    ]),
  ])
  const weightedPoint = weighted.points.find((point) => point.n > 0)
  if (!weightedPoint || weightedPoint.median !== 140 || weightedPoint.n !== 10 || weightedPoint.samples !== 2) {
    throw new Error(`weight ${weightedPoint?.median} ${weightedPoint?.n} ${weightedPoint?.samples}`)
  }
  const bins = buildHrBins([
    run('run', [
      { t: 0, hr: 140, speed: 3 },
      { t: 10, hr: 140, speed: 3 },
      { t: 20, hr: 160, speed: 3 },
      { t: 30, hr: 160, speed: 3 },
      { t: 400, hr: 160, speed: 3 },
      { t: 410, hr: null, speed: 3 },
    ]),
  ])
  const at = (hr: number) => bins.find((bin) => bin.hr === hr)?.seconds ?? 0
  if (at(140) !== 20 || at(160) !== 10) throw new Error(`bins 140=${at(140)} 160=${at(160)}`)
  const five = zoneSlices(bins, '5', 200, 60)
  const three = zoneSlices(bins, '3', 200, 60)
  const slice = (rows: ZoneSlice[], key: string) => rows.find((row) => row.key === key)?.seconds ?? -1
  if (slice(five, 'z1') !== 20 || slice(five, 'z3') !== 10 || slice(three, 'easy') !== 20 || slice(three, 'medium') !== 10) {
    throw new Error(`zones ${five.map((row) => row.seconds).join()} / ${three.map((row) => row.seconds).join()}`)
  }
  const now = 1_700_000_000_000
  const windows = paceWindows('90d', 'previous', now)
  if (windows.end - windows.start !== 90 * DAY_MS || windows.compareEnd !== windows.start) throw new Error('previous window')
  const year = paceWindows('30d', 'year', now)
  if (year.end - year.start !== 30 * DAY_MS || year.compareEnd !== now - 365 * DAY_MS) throw new Error('year window')
  const sample = [
    { speed: 5.5, p25: 100, p75: 120, median: 110, n: 120, samples: 4 },
    { speed: 7.25, p25: 120, p75: 130, median: 125, n: 120, samples: 4 },
    { speed: 8, p25: 130, p75: 150, median: 140, n: 120, samples: 9 },
    { speed: 18, p25: 180, p75: 190, median: 185, n: 10, samples: 1 },
  ]
  const clipped = paceRows(sample, [{ speed: 8, p25: 140, p75: 160, median: 150, n: 120, samples: 6 }], false)
  if (clipped.length !== 1 || clipped[0].median !== 140 || clipped[0].before !== 150 || clipped[0].iqr !== 20 || clipped[0].samples !== 9 || clipped[0].beforeSamples !== 6 || clipped.some((row) => row.speed < 7.5)) {
    throw new Error(`clipped ${JSON.stringify(clipped)}`)
  }
  const open = paceRows(sample, [], true)
  const thin = open.find((row) => row.speed === 18)
  if (!thin || thin.median !== null || thin.medianThin !== 185 || open.find((row) => row.speed === 5.5)?.median !== 110) {
    throw new Error('thin or floor')
  }
}
