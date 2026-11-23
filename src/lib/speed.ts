import type { Activity, StreamPoint } from '../types'

/** Riegel: T₂ = T₁ × (D₂/D₁)^1.06. The envelope is 1.04 (speed) to 1.08 (endurance). */
const RIEGEL = 1.06
const SPEED_EXP = 1.04
const ENDURE_EXP = 1.08
const MIN_FIT = 3
const MIN_R2 = 0.98
/** Critical speed is fit on this window. Longer efforts are only drawn. */
const FIT_FROM = 120
const FIT_TO = 1200
const FRESH_MS = 90 * 24 * 60 * 60 * 1000
const GAP_SEC = 180
const PACE_MIN = 140
const PACE_MAX = 900
/** Usain Bolt's top speed (44.72 km/h) + 3 km/h. Faster than that is not running: the effort breaks there. */
const MAX_SPEED = (44.72 + 3) / 3.6

export type DistanceClass = 'short' | 'intermediate' | 'long' | 'veryLong'

export const CLASS_LABEL: Record<DistanceClass, string> = {
  short: 'Short',
  intermediate: 'Intermediate',
  long: 'Long',
  veryLong: 'Very long',
}

const DISTANCES: { meters: number; label: string; klass: DistanceClass }[] = [
  { meters: 1000, label: '1 km', klass: 'short' },
  { meters: 5000, label: '5 km', klass: 'intermediate' },
  { meters: 10000, label: '10 km', klass: 'intermediate' },
  { meters: 15000, label: '15 km', klass: 'long' },
  { meters: 21097.5, label: '21.1 km', klass: 'long' },
  { meters: 42195, label: '42.2 km', klass: 'veryLong' },
]

/** Published duration steps. A step is omitted until a run actually covers it. */
const STEPS: { seconds: number; label: string }[] = [
  { seconds: 30, label: '30 s' },
  { seconds: 60, label: '1 min' },
  { seconds: 120, label: '2 min' },
  { seconds: 180, label: '3 min' },
  { seconds: 300, label: '5 min' },
  { seconds: 600, label: '10 min' },
  { seconds: 1200, label: '20 min' },
  { seconds: 1800, label: '30 min' },
  { seconds: 2700, label: '45 min' },
  { seconds: 3600, label: '1 h' },
  { seconds: 5400, label: '1 h 30' },
  { seconds: 7200, label: '2 h' },
  { seconds: 9000, label: '2 h 30' },
]

export type DistanceRecord = {
  meters: number
  label: string
  klass: DistanceClass
  seconds: number
  /** Seconds per kilometre. */
  pace: number
  date: string | null
  hr: number | null
  activityId: string
}

export type PlottedRecord = DistanceRecord & {
  anchor: boolean
  outside: boolean
  /** Pace the anchor implies at this distance with exponent 1.06. */
  implied: number
}

export type CurveRow = {
  meters: number
  curve: number
  low: number
  fastGap: number
  slowGap: number
  pace: number | null
  record: PlottedRecord | null
}

export type Freshness = 'recent' | 'old' | 'missing'

export type DurationEffort = {
  seconds: number
  label: string
  meters: number
  kmh: number
  pace: number
  date: string | null
  hr: number | null
  fresh: Freshness
  activityId: string
}

export type CriticalFit = {
  metersPerSec: number
  kmh: number
  pace: number
  r2: number
}

export type SpeedModel = {
  records: DistanceRecord[]
  efforts: DurationEffort[]
  critical: CriticalFit | null
  now: number
}

type TimeHit = { seconds: number; hr: number | null }
type SpanHit = { meters: number; hr: number | null }

function activityDate(activity: Activity): string | null {
  const time = Date.parse(activity.date)
  return Number.isFinite(time) ? activity.date : null
}

function newer(date: string | null, previous: string | null): boolean {
  if (date === null) return false
  if (previous === null) return true
  return date > previous
}

function freshOf(date: string | null, now: number): Freshness {
  if (date === null) return 'missing'
  const time = Date.parse(date)
  if (!Number.isFinite(time)) return 'missing'
  return now - time <= FRESH_MS ? 'recent' : 'old'
}

function keptPace(seconds: number, meters: number): boolean {
  if (meters <= 0 || seconds <= 0) return false
  const pace = seconds / (meters / 1000)
  return pace >= PACE_MIN && pace <= PACE_MAX
}

/** Breaks on a time gap, a distance step, or an impossible speed. Stops stay inside the effort: elapsed time counts them. */
function segments(stream: StreamPoint[]): StreamPoint[][] {
  const out: StreamPoint[][] = []
  let current: StreamPoint[] = []
  for (const point of stream) {
    const previous = current[current.length - 1]
    const dt = previous ? point.t - previous.t : 0
    const dd = previous ? point.d - previous.d : 0
    const tooFast = (point.speed ?? 0) > MAX_SPEED || (dt > 0 && dd / dt > MAX_SPEED)
    const broken = previous !== undefined && (dt <= 0 || dt > GAP_SEC || dd < 0 || tooFast)
    if (broken) {
      if (current.length >= 2) out.push(current)
      current = [point]
      continue
    }
    current.push(point)
  }
  if (current.length >= 2) out.push(current)
  return out
}

function hrOf(segment: StreamPoint[], t0: number, t1: number): number | null {
  let sum = 0
  let weight = 0
  for (let index = 0; index < segment.length - 1; index += 1) {
    const start = segment[index]
    const end = segment[index + 1]
    const left = Math.max(start.t, t0)
    const right = Math.min(end.t, t1)
    if (right <= left || start.hr === null || start.hr < 40 || start.hr > 230) continue
    sum += start.hr * (right - left)
    weight += right - left
  }
  return weight > 0 ? Math.round(sum / weight) : null
}

/** Fastest continuous time to cover `meters`. */
function fastest(segment: StreamPoint[], meters: number): TimeHit | null {
  let best: TimeHit | null = null
  let end = 1
  for (let start = 0; start < segment.length - 1; start += 1) {
    const need = segment[start].d + meters
    if (end < start + 1) end = start + 1
    while (end < segment.length && segment[end].d < need) end += 1
    if (end >= segment.length) break
    const before = segment[end - 1]
    const after = segment[end]
    const span = after.d - before.d
    if (span <= 0) continue
    const tEnd = before.t + ((after.t - before.t) * (need - before.d)) / span
    const seconds = tEnd - segment[start].t
    if (seconds <= 0 || !keptPace(seconds, meters)) continue
    if (!best || seconds < best.seconds) best = { seconds, hr: hrOf(segment, segment[start].t, tEnd) }
  }
  return best
}

/** Farthest continuous distance covered in `seconds`. */
function farthest(segment: StreamPoint[], seconds: number): SpanHit | null {
  let best: SpanHit | null = null
  let end = 1
  for (let start = 0; start < segment.length - 1; start += 1) {
    const tEnd = segment[start].t + seconds
    if (segment[segment.length - 1].t < tEnd) break
    if (end < start + 1) end = start + 1
    while (end < segment.length && segment[end].t < tEnd) end += 1
    if (end >= segment.length) break
    const before = segment[end - 1]
    const after = segment[end]
    const span = after.t - before.t
    if (span <= 0) continue
    const dEnd = before.d + ((after.d - before.d) * (tEnd - before.t)) / span
    const covered = dEnd - segment[start].d
    if (!keptPace(seconds, covered)) continue
    if (!best || covered > best.meters) best = { meters: covered, hr: hrOf(segment, segment[start].t, tEnd) }
  }
  return best
}

function paceAt(anchor: DistanceRecord, meters: number, exponent: number): number {
  const time = anchor.seconds * (meters / anchor.meters) ** exponent
  return time / (meters / 1000)
}

/** Smallest T / D^1.06. A tie keeps the longer distance. */
export function strongestRecord(records: DistanceRecord[]): DistanceRecord | null {
  let best: DistanceRecord | null = null
  let level = Infinity
  for (const record of records) {
    const score = record.seconds / record.meters ** RIEGEL
    const longerTie = Math.abs(score - level) <= 1e-9 && record.meters > (best?.meters ?? 0)
    if (score < level - 1e-9 || longerTie) {
      best = record
      level = score
    }
  }
  return best
}

/** Curve and envelope from the shortest raced distance to the longest. Nothing beyond. */
export function curveRows(records: DistanceRecord[], anchor: DistanceRecord): CurveRow[] {
  if (records.length === 0) return []
  const sorted = records.slice().sort((a, b) => a.meters - b.meters)
  const first = sorted[0].meters
  const last = sorted[sorted.length - 1].meters
  const steps = last <= first ? 0 : 40
  const rows: CurveRow[] = []
  for (let index = 0; index <= steps; index += 1) {
    rows.push(sample(first + ((last - first) * index) / (steps || 1), anchor, null))
  }
  for (const record of sorted) {
    const row = sample(record.meters, anchor, record)
    let index = 0
    while (index < rows.length && rows[index].meters < record.meters - 0.5) index += 1
    if (index < rows.length && Math.abs(rows[index].meters - record.meters) <= 0.5) rows[index] = row
    else rows.splice(index, 0, row)
  }
  return rows
}

function sample(meters: number, anchor: DistanceRecord, record: DistanceRecord | null): CurveRow {
  const curve = paceAt(anchor, meters, RIEGEL)
  const speed = paceAt(anchor, meters, SPEED_EXP)
  const endure = paceAt(anchor, meters, ENDURE_EXP)
  const low = Math.min(speed, endure)
  const high = Math.max(speed, endure)
  const plotted: PlottedRecord | null = record
    ? {
        ...record,
        anchor: record.meters === anchor.meters,
        implied: curve,
        outside: record.meters !== anchor.meters && (record.pace < low - 0.5 || record.pace > high + 0.5),
      }
    : null
  return {
    meters,
    curve,
    low,
    fastGap: Math.max(0, curve - low),
    slowGap: Math.max(0, high - curve),
    pace: record?.pace ?? null,
    record: plotted,
  }
}

/** distance = D′ + critical speed × time. Null unless 3 distances and R² ≥ 0.98. */
function fitCriticalSpeed(points: { meters: number; seconds: number }[]): CriticalFit | null {
  if (points.length < MIN_FIT) return null
  let sumT = 0
  let sumD = 0
  for (const point of points) {
    sumT += point.seconds
    sumD += point.meters
  }
  const meanT = sumT / points.length
  const meanD = sumD / points.length
  let varT = 0
  let cov = 0
  for (const point of points) {
    const dt = point.seconds - meanT
    varT += dt * dt
    cov += dt * (point.meters - meanD)
  }
  if (varT <= 0) return null
  const metersPerSec = cov / varT
  if (metersPerSec <= 0) return null
  const dPrime = meanD - metersPerSec * meanT
  let ssTot = 0
  let ssRes = 0
  for (const point of points) {
    const residual = point.meters - (dPrime + metersPerSec * point.seconds)
    const dev = point.meters - meanD
    ssRes += residual * residual
    ssTot += dev * dev
  }
  if (ssTot <= 0) return null
  const r2 = 1 - ssRes / ssTot
  if (r2 < MIN_R2) return null
  const kmh = metersPerSec * 3.6
  return { metersPerSec, kmh, pace: 3600 / kmh, r2 }
}

export function distanceLabel(meters: number): string {
  const hit = DISTANCES.find((mark) => Math.abs(mark.meters - meters) < 1)
  if (hit) return hit.label
  const km = meters / 1000
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

export function buildSpeedProfile(activities: Activity[], now = Date.now()): SpeedModel {
  const times = new Map<number, DistanceRecord>()
  const spans = new Map<number, DurationEffort>()
  for (const activity of activities) {
    if (activity.sport !== 'run') continue
    const date = activityDate(activity)
    for (const segment of segments(activity.stream ?? [])) {
      for (const mark of DISTANCES) {
        const hit = fastest(segment, mark.meters)
        if (!hit) continue
        const previous = times.get(mark.meters)
        const faster = previous === undefined || hit.seconds < previous.seconds - 0.05
        const tie = previous !== undefined && Math.abs(hit.seconds - previous.seconds) <= 0.05 && newer(date, previous.date)
        if (!faster && !tie) continue
        times.set(mark.meters, {
          meters: mark.meters,
          label: mark.label,
          klass: mark.klass,
          seconds: hit.seconds,
          pace: hit.seconds / (mark.meters / 1000),
          date,
          hr: hit.hr,
          activityId: activity.id,
        })
      }
      for (const step of STEPS) {
        const hit = farthest(segment, step.seconds)
        if (!hit) continue
        const previous = spans.get(step.seconds)
        const farther = previous === undefined || hit.meters > previous.meters + 0.5
        const tie = previous !== undefined && Math.abs(hit.meters - previous.meters) <= 0.5 && newer(date, previous.date)
        if (!farther && !tie) continue
        const kmh = (hit.meters / step.seconds) * 3.6
        spans.set(step.seconds, {
          seconds: step.seconds,
          label: step.label,
          meters: hit.meters,
          kmh,
          pace: 3600 / kmh,
          date,
          hr: hit.hr,
          fresh: freshOf(date, now),
          activityId: activity.id,
        })
      }
    }
  }
  const records = [...times.values()].sort((a, b) => a.meters - b.meters)
  const efforts = [...spans.values()].sort((a, b) => a.seconds - b.seconds)
  return {
    records,
    efforts,
    critical: fitCriticalSpeed(
      efforts
        .filter((effort) => effort.seconds >= FIT_FROM && effort.seconds <= FIT_TO)
        .map((effort) => ({ meters: effort.meters, seconds: effort.seconds })),
    ),
    now,
  }
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('speed.ts')) {
  const point = (t: number, d: number, hr: number | null, speed: number): StreamPoint => ({ t, d, alt: null, hr, cad: null, speed })
  const steady = (seconds: number, speed: number, hr: number | null, step = 10): StreamPoint[] => {
    const stream: StreamPoint[] = []
    for (let t = 0; t <= seconds; t += step) stream.push(point(t, speed * t, hr, speed))
    return stream
  }
  const run = (id: string, date: string, stream: StreamPoint[], sport: Activity['sport'] = 'run'): Activity => {
    const last = stream[stream.length - 1]
    return {
      id,
      name: id,
      type: 'Run',
      sport,
      date,
      movingSec: last?.t ?? 0,
      elapsedSec: last?.t ?? 0,
      distanceM: last?.d ?? 0,
      elevationM: 0,
      avgHr: null,
      track: [],
      stream,
    }
  }
  const now = Date.parse('2026-06-01T12:00:00.000Z')
  const recent = new Date(now - 10 * 86400000).toISOString()
  const old = new Date(now - 200 * 86400000).toISOString()
  const t10 = 2500
  const t5 = t10 * 0.5 ** RIEGEL
  const gap: StreamPoint[] = []
  for (let t = 0; t <= 500; t += 10) gap.push(point(t, 4 * t, 150, 4))
  for (let t = 800; t <= 1300; t += 10) gap.push(point(t, 2000 + 4 * (t - 800), null, 4))
  const model = buildSpeedProfile(
    [
      run('flat', recent, steady(2600, 4, 160)),
      run('matched', recent, steady(t5 + 30, 5000 / t5, 150, 5)),
      run('slow', old, steady(5000, 3, null)),
      run('gap', recent, gap),
      run('spike', recent, steady(200, 20, 180)),
      run('ride', recent, steady(3600, 10, 120), 'ride'),
    ],
    now,
  )
  const at = (meters: number) => model.records.find((record) => record.meters === meters)
  const km1 = at(1000)
  const km5 = at(5000)
  const km10 = at(10000)
  const km15 = at(15000)
  if (!km1 || Math.abs(km1.seconds - t5 / 5) > 1 || km1.hr !== 150) throw new Error(`1 km ${km1?.seconds} hr ${km1?.hr}`)
  if (!km5 || !km10 || !km15) throw new Error(`marks ${model.records.map((record) => record.label).join()}`)
  if (model.records.some((record) => record.meters > 15000 || record.meters < 1000)) throw new Error('extra distance')
  if (strongestRecord(model.records)?.meters !== 10000) throw new Error(`anchor ${strongestRecord(model.records)?.label}`)
  const rows = curveRows(model.records, km10)
  if (rows[0].meters !== 1000 || rows[rows.length - 1].meters !== 15000) throw new Error('curve ends')
  const anchorRow = rows.find((row) => row.record?.meters === 10000)
  const short = rows.find((row) => Math.abs(row.meters - 1000) < 1)
  const long = rows.find((row) => row.record?.meters === 15000)
  const mid = rows.find((row) => row.record?.meters === 5000)
  if (!anchorRow?.record?.anchor || anchorRow.fastGap > 0.05 || anchorRow.slowGap > 0.05) throw new Error('anchor envelope')
  if (!mid?.record || mid.record.outside || mid.record.anchor) throw new Error('matched 5 km')
  if (!long?.record?.outside) throw new Error('slow 15 km should leave the envelope')
  const implied = (t10 * 1.5 ** RIEGEL) / 15
  const low = (t10 * 1.5 ** SPEED_EXP) / 15
  const high = (t10 * 1.5 ** ENDURE_EXP) / 15
  if (!long?.record || Math.abs(long.record.implied - implied) > 0.05 || Math.abs(long.low - low) > 0.05) throw new Error('15 km curve')
  if (Math.abs(long.low + long.fastGap + long.slowGap - high) > 0.05) throw new Error('15 km high')
  const lowShort = Math.min((t10 * 0.1 ** SPEED_EXP) / 1, (t10 * 0.1 ** ENDURE_EXP) / 1)
  if (!short || Math.abs(short.low - lowShort) > 0.05 || !(0.1 ** ENDURE_EXP < 0.1 ** SPEED_EXP)) throw new Error('1 km envelope')
  const flat = buildSpeedProfile([run('flat', recent, steady(2600, 4, 160))], now)
  if (!flat.critical || Math.abs(flat.critical.kmh - 14.4) > 0.05 || flat.critical.r2 < 0.999) {
    throw new Error(`critical ${flat.critical?.kmh} ${flat.critical?.r2}`)
  }
  const steps = model.efforts.map((effort) => effort.seconds).join()
  if (steps !== '30,60,120,180,300,600,1200,1800,2700,3600') throw new Error(`steps ${steps}`)
  const sprint = model.efforts[0]
  const hour = model.efforts.find((effort) => effort.seconds === 3600)
  const matchedKmh = (5000 / t5) * 3.6
  if (!sprint || Math.abs(sprint.kmh - matchedKmh) > 0.05 || sprint.fresh !== 'recent' || sprint.hr !== 150) throw new Error(`30 s ${sprint?.kmh}`)
  if (!hour || Math.abs(hour.kmh - 10.8) > 0.05 || hour.fresh !== 'old' || hour.hr !== null) throw new Error('1 h')
  const gapped = buildSpeedProfile([run('gap', recent, gap)], now)
  if (gapped.records.some((record) => record.meters >= 5000) || !gapped.records.some((record) => record.meters === 1000)) {
    throw new Error('gap crossed')
  }
  const pair = buildSpeedProfile([run('short', recent, steady(1400, 4, 140))], now)
  if (pair.records.length !== 2) throw new Error(`pair records ${pair.records.length}`)
  const brief = buildSpeedProfile([run('brief', recent, steady(200, 4, 140))], now)
  if (brief.critical !== null) throw new Error('two short efforts still fit')
  const blank = buildSpeedProfile([run('none', 'nope', steady(1200, 4, null))], now)
  if (blank.efforts[0]?.fresh !== 'missing' || blank.efforts[0]?.hr !== null) throw new Error('missing date')
  if (buildSpeedProfile([run('spike', recent, steady(200, 20, 180))], now).records.length !== 0) throw new Error('spike kept')
  const messy = fitCriticalSpeed([
    { meters: 1000, seconds: 100 },
    { meters: 5000, seconds: 200 },
    { meters: 2000, seconds: 800 },
  ])
  if (messy !== null) throw new Error(`messy fit ${messy.r2}`)
  if (fitCriticalSpeed([{ meters: 1000, seconds: 250 }, { meters: 5000, seconds: 1250 }]) !== null) throw new Error('two-point fit')
  // A 15 m/s burst (faster than Bolt + 3 km/h) breaks the effort: no 3 km record through it.
  const burst: StreamPoint[] = [...steady(600, 4, 150)]
  for (let t = 610; t <= 700; t += 10) burst.push(point(t, 2400 + 15 * (t - 600), 150, 15))
  for (let t = 710; t <= 1300; t += 10) burst.push(point(t, 3900 + 4 * (t - 700), 150, 4))
  const bursty = buildSpeedProfile([run('burst', recent, burst)], now).records.find((record) => record.meters === 1000)
  // Without the cap, half a km at 15 m/s would make a 1 km at about 2:38/km. Only the 4 m/s running counts: 250 s/km.
  if (!bursty || Math.abs(bursty.pace - 250) > 1) throw new Error(`burst pace ${bursty?.pace}`)
}
