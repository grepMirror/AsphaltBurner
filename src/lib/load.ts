import type { Activity, DateWindow } from '../types'
import { heartRateZone, intensityFromHeartRate, INTENSITY_COLOR, type ZoneEdges, DEFAULT_ZONES } from './intensity'
import { formatDayInput, formatWindow, parseDay, startOfWeek, windowBounds } from './period'

export type LoadRange = '4w' | '8w' | '12w' | 'custom'
export type LoadMetric = 'volume' | 'hour' | 'elevation'
export type ZoneStyle = '5' | '3'

export type ZoneBand = {
  key: string
  label: string
  color: string
  zone: number
}

export const ZONE_BANDS: Record<ZoneStyle, ZoneBand[]> = {
  '5': [
    { key: 'z1', label: 'Z1', color: '#1F6F8B', zone: 1 },
    { key: 'z2', label: 'Z2', color: '#5EB0C8', zone: 2 },
    { key: 'z3', label: 'Z3', color: '#FACC15', zone: 3 },
    { key: 'z4', label: 'Z4', color: '#FB923C', zone: 4 },
    { key: 'z5', label: 'Z5', color: '#DC2626', zone: 5 },
  ],
  '3': [
    { key: 'easy', label: 'Easy', color: INTENSITY_COLOR.easy, zone: 1 },
    { key: 'medium', label: 'Medium', color: INTENSITY_COLOR.medium, zone: 3 },
    { key: 'hard', label: 'Hard', color: INTENSITY_COLOR.hard, zone: 4 },
  ],
}

export type LoadWeek = {
  label: string
  start: number
  values: Record<string, number>
  total: number
  /** Percent change against the previous week. Empty on the first week and when the previous week is zero. */
  change: number | null
}

export type ZoneShare = {
  key: string
  label: string
  color: string
  seconds: number
  value: number
}

const GAP_CAP_SEC = 180

export function loadBounds(range: LoadRange, custom: DateWindow | null, now = new Date()): { start: number; end: number } {
  if (range === 'custom' && custom) return windowBounds(custom)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const weeks = range === '4w' ? 4 : range === '12w' ? 12 : 8
  const start = startOfWeek(end)
  start.setDate(start.getDate() - (weeks - 1) * 7)
  return { start: start.getTime(), end: end.getTime() }
}

export function loadWindowLabel(range: LoadRange, custom: DateWindow | null, now = new Date()): string {
  const bounds = loadBounds(range, custom, now)
  return formatWindow({ start: formatDayInput(new Date(bounds.start)), end: formatDayInput(new Date(bounds.end)) })
}

function bandSlot(hr: number, maxHr: number, style: ZoneStyle, zones: ZoneEdges): number {
  if (style === '5') return heartRateZone(hr, maxHr, zones) - 1
  const level = intensityFromHeartRate(hr, maxHr, zones)
  if (level === 'medium') return 1
  if (level === 'hard') return 2
  return 0
}

/** Share of the session in each displayed band. A session with only an average heart rate counts entirely in that band. */
export function zoneFractions(activity: Activity, maxHr: number, style: ZoneStyle = '5', zones: ZoneEdges = DEFAULT_ZONES): number[] | null {
  const weights = style === '5' ? [0, 0, 0, 0, 0] : [0, 0, 0]
  const stream = activity.stream ?? []
  for (let index = 0; index < stream.length - 1; index += 1) {
    const current = stream[index]
    const next = stream[index + 1]
    const span = next.t - current.t
    if (span <= 0 || span > GAP_CAP_SEC) continue
    const hr = current.hr ?? next.hr
    if (hr === null || hr <= 0) continue
    weights[bandSlot(hr, maxHr, style, zones)] += span
  }
  const total = weights.reduce((sum, value) => sum + value, 0)
  if (total > 0) return weights.map((value) => value / total)
  if (activity.avgHr && activity.avgHr > 0) {
    const only = weights.map(() => 0)
    only[bandSlot(activity.avgHr, maxHr, style, zones)] = 1
    return only
  }
  return null
}

function metricAmount(activity: Activity, metric: LoadMetric): number {
  if (metric === 'hour') return activity.movingSec / 3600
  if (metric === 'elevation') return activity.elevationM
  return activity.distanceM / 1000
}

export function buildLoadWeeks(activities: Activity[], range: LoadRange, custom: DateWindow | null, metric: LoadMetric, style: ZoneStyle, maxHr: number, zones: ZoneEdges = DEFAULT_ZONES, now = new Date()): LoadWeek[] {
  const bounds = loadBounds(range, custom, now)
  const bands = ZONE_BANDS[style]
  const starts: Date[] = []
  const cursor = startOfWeek(new Date(bounds.start))
  while (cursor.getTime() <= bounds.end && starts.length < 60) {
    starts.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }
  if (starts.length === 0) starts.push(startOfWeek(new Date(bounds.end)))

  const weeks = starts.map((start) => {
    const next = new Date(start)
    next.setDate(next.getDate() + 7)
    const values: Record<string, number> = {}
    for (const band of bands) values[band.key] = 0
    for (const activity of activities) {
      const time = new Date(activity.date).getTime()
      if (Number.isNaN(time) || time < start.getTime() || time >= next.getTime() || time < bounds.start || time > bounds.end) continue
      const fractions = zoneFractions(activity, maxHr, style, zones)
      if (!fractions) continue
      const amount = metricAmount(activity, metric)
      fractions.forEach((fraction, zone) => {
        const band = bands[zone]
        if (band) values[band.key] += amount * fraction
      })
    }
    const total = bands.reduce((sum, band) => sum + values[band.key], 0)
    return {
      label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      start: start.getTime(),
      values,
      total,
      change: null as number | null,
    }
  })

  for (let index = 1; index < weeks.length; index += 1) {
    const previous = weeks[index - 1].total
    if (previous > 0) weeks[index].change = ((weeks[index].total - previous) / previous) * 100
  }
  return weeks
}

export function periodZoneShares(activities: Activity[], range: LoadRange, custom: DateWindow | null, style: ZoneStyle, maxHr: number, zones: ZoneEdges = DEFAULT_ZONES, now = new Date()): ZoneShare[] {
  const bounds = loadBounds(range, custom, now)
  const bands = ZONE_BANDS[style]
  const seconds = bands.map(() => 0)
  for (const activity of activities) {
    const time = new Date(activity.date).getTime()
    if (Number.isNaN(time) || time < bounds.start || time > bounds.end) continue
    const fractions = zoneFractions(activity, maxHr, style, zones)
    if (!fractions) continue
    fractions.forEach((fraction, zone) => {
      if (seconds[zone] !== undefined) seconds[zone] += activity.movingSec * fraction
    })
  }
  return bands.map((band, index) => ({
    key: band.key,
    label: band.label,
    color: band.color,
    seconds: seconds[index],
    value: seconds[index],
  }))
}

export function suggestCustomWindow(now = new Date()): DateWindow {
  const bounds = loadBounds('8w', null, now)
  return { start: formatDayInput(new Date(bounds.start)), end: formatDayInput(new Date(bounds.end)) }
}

export function parseCustomDraft(start: string, end: string): DateWindow | null {
  if (!start || !end) return null
  const from = parseDay(start)
  const to = parseDay(end)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return from.getTime() <= to.getTime() ? { start, end } : { start: end, end: start }
}
