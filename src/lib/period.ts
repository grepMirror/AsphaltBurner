import type { Activity, DateWindow, MetricId, RangeId, Sport } from '../types'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type Bounds = {
  start: number
  end: number
}

export type Grain = 'day' | 'week' | 'month'

export type Bucket = {
  label: string
  start: number
  end: number
  values: Record<Sport, number>
  km: number
  hours: number
  sessions: number
  elevationM: number
}

export function startOfWeek(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  const mondayOffset = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - mondayOffset)
  return next
}

export function formatDayInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

/** Monday 00:00 through Sunday 23:59, in local time. */
export function weekWindow(date: Date): DateWindow {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start: formatDayInput(start), end: formatDayInput(end) }
}

export function windowBounds(window: DateWindow): Bounds {
  let start = parseDay(window.start)
  let end = parseDay(window.end)
  if (start.getTime() > end.getTime()) {
    const swap = start
    start = end
    end = swap
  }
  end.setHours(23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

export function periodBounds(range: RangeId, now = new Date(), custom?: DateWindow | null): Bounds {
  if (range === 'custom' && custom) return windowBounds(custom)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  if (range === 'all' || range === 'custom') return { start: 0, end: end.getTime() }
  if (range === '4w' || range === '12w') {
    const weeks = range === '4w' ? 4 : 12
    const start = startOfWeek(end)
    start.setDate(start.getDate() - (weeks - 1) * 7)
    return { start: start.getTime(), end: end.getTime() }
  }
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1)
  return { start: start.getTime(), end: end.getTime() }
}

export function grainFor(range: RangeId, bounds: Bounds): Grain {
  if (range === '4w' || range === '12w') return 'week'
  if (range === '12m' || range === 'all') return 'month'
  const days = (bounds.end - bounds.start) / (24 * 60 * 60 * 1000)
  if (days <= 16) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}

function addStep(date: Date, grain: Grain): Date {
  const next = new Date(date)
  if (grain === 'day') next.setDate(next.getDate() + 1)
  else if (grain === 'week') next.setDate(next.getDate() + 7)
  else next.setMonth(next.getMonth() + 1)
  return next
}

function metricValue(activity: Activity, metric: MetricId): number {
  if (metric === 'sessions') return 1
  if (metric === 'h') return activity.movingSec / 3600
  if (metric === 'elev') return activity.elevationM
  return activity.distanceM / 1000
}

function bucketLabel(start: Date, grain: Grain): string {
  if (grain === 'day') return start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
  if (grain === 'week') return start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return start.toLocaleDateString('en-GB', { month: 'short' })
}

export function buildBuckets(
  activities: Activity[],
  bounds: Bounds,
  metric: MetricId,
  grain: Grain,
): Bucket[] {
  const starts: Date[] = []
  if (grain === 'month' && bounds.start === 0) {
    const times = activities
      .map((activity) => new Date(activity.date).getTime())
      .filter((time) => !Number.isNaN(time) && time <= bounds.end)
    const first = times.length ? new Date(Math.min(...times)) : new Date(bounds.end)
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1)
    const last = new Date(bounds.end)
    const lastMonth = new Date(last.getFullYear(), last.getMonth(), 1)
    while (cursor <= lastMonth && starts.length < 36) {
      starts.push(new Date(cursor))
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else if (grain === 'month') {
    const cursor = new Date(bounds.start)
    const startMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(bounds.end)
    const lastMonth = new Date(last.getFullYear(), last.getMonth(), 1)
    const pointer = new Date(startMonth)
    while (pointer <= lastMonth && starts.length < 36) {
      starts.push(new Date(pointer))
      pointer.setMonth(pointer.getMonth() + 1)
    }
  } else if (grain === 'week') {
    const cursor = startOfWeek(new Date(bounds.start === 0 ? bounds.end : bounds.start))
    while (cursor.getTime() <= bounds.end && starts.length < 60) {
      starts.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 7)
    }
  } else {
    const cursor = new Date(bounds.start)
    cursor.setHours(0, 0, 0, 0)
    while (cursor.getTime() <= bounds.end && starts.length < 31) {
      starts.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  if (starts.length === 0) starts.push(new Date(bounds.end))

  return starts.map((start) => {
    const next = addStep(start, grain)
    const values: Record<Sport, number> = { run: 0, swim: 0, ride: 0, other: 0 }
    let km = 0
    let hours = 0
    let sessions = 0
    let elevationM = 0
    for (const activity of activities) {
      const time = new Date(activity.date).getTime()
      if (time < start.getTime() || time >= next.getTime() || time > bounds.end || time < bounds.start) continue
      values[activity.sport] += metricValue(activity, metric)
      km += activity.distanceM / 1000
      hours += activity.movingSec / 3600
      sessions += 1
      elevationM += activity.elevationM
    }
    return {
      label: bucketLabel(start, grain),
      start: start.getTime(),
      end: next.getTime(),
      values,
      km,
      hours,
      sessions,
      elevationM,
    }
  })
}

export function inPeriod(activity: Activity, range: RangeId, now = new Date(), custom?: DateWindow | null): boolean {
  const time = new Date(activity.date).getTime()
  const bounds = periodBounds(range, now, custom)
  return time >= bounds.start && time <= bounds.end
}

export function activeWeeks(activities: Activity[], bounds: Bounds): { active: number; total: number } {
  const weeks = new Set<number>()
  let earliest = bounds.start
  for (const activity of activities) {
    const time = new Date(activity.date).getTime()
    if (Number.isNaN(time) || time < bounds.start || time > bounds.end) continue
    weeks.add(startOfWeek(new Date(time)).getTime())
    if (bounds.start === 0) earliest = earliest === 0 ? time : Math.min(earliest, time)
  }
  const spanStart = bounds.start === 0 ? (weeks.size ? Math.min(...weeks) : bounds.end) : bounds.start
  const total = Math.max(1, Math.round((bounds.end - spanStart) / WEEK_MS))
  return { active: weeks.size, total }
}

export function formatWindow(window: DateWindow): string {
  const start = parseDay(window.start)
  const end = parseDay(window.end)
  const startLabel = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const endOptions: Intl.DateTimeFormatOptions =
    start.getFullYear() === end.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  return `${startLabel} – ${end.toLocaleDateString('en-GB', endOptions)}`
}
