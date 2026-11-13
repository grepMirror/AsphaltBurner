import { SPORT_LABEL } from './format'
import { INTENSITY_CELL, INTENSITY_LABEL, intensityOf, type Intensity } from './intensity'
import { formatDayInput, startOfWeek } from './period'
import type { Activity, Sport } from '../types'

const INTENSITIES: Intensity[] = ['easy', 'medium', 'hard']

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type DayCell = {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  bg: string
  fg: string
  ring: string
  bars: [number, number, number] | null
  sports: Sport[]
  km: string
  unit: string
  tip: string
  sessions: Activity[]
}

export type WeekMetric = {
  label: string
  value: string
  unit: string
}

export type WeekRow = {
  id: string
  label: string
  range: string
  isCurrent: boolean
  border: string
  metrics: WeekMetric[]
  days: DayCell[]
}

export type MonthTile = {
  label: string
  value: string
  unit: string
  sub: string
}

export type MonthCalendar = {
  title: string
  tiles: MonthTile[]
  weeks: WeekRow[]
  legend: { id: Intensity; name: string; days: number; bg: string; fg: string; bars: [number, number, number] }[]
  restDays: number
}

export function localDayKey(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return formatDayInput(date)
}

export function monthOfLatest(activities: Activity[]): { year: number; month: number } | null {
  let latest: Date | null = null
  for (const activity of activities) {
    const date = new Date(activity.date)
    if (Number.isNaN(date.getTime())) continue
    if (!latest || date.getTime() > latest.getTime()) latest = date
  }
  if (!latest) return null
  return { year: latest.getFullYear(), month: latest.getMonth() }
}

function formatHm(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, '0')}`
}

function isoWeekNumber(monday: Date): number {
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  const jan4 = new Date(thursday.getFullYear(), 0, 4)
  const weekOne = startOfWeek(jan4)
  return 1 + Math.round((monday.getTime() - weekOne.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

function rangeLabel(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`
  }
  return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function pluralDays(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`
}

/** Up to three different sports, longest distance first. */
function sportsOnDay(sessions: Activity[]): Sport[] {
  const meters = new Map<Sport, number>()
  for (const activity of sessions) {
    meters.set(activity.sport, (meters.get(activity.sport) ?? 0) + activity.distanceM)
  }
  return [...meters.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([sport]) => sport)
}

function sum(activities: Activity[]) {
  return activities.reduce(
    (total, activity) => ({
      seconds: total.seconds + activity.movingSec,
      meters: total.meters + activity.distanceM,
      elevation: total.elevation + activity.elevationM,
      sessions: total.sessions + 1,
    }),
    { seconds: 0, meters: 0, elevation: 0, sessions: 0 },
  )
}

/**
 * Month grid from the Monday of the first week through the Sunday of the last.
 * Week totals include neighbouring-month days. Month tiles do not.
 */
export function buildMonthCalendar(activities: Activity[], year: number, month: number, maxHr: number, now = new Date()): MonthCalendar {
  const todayKey = formatDayInput(now)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const byDay = new Map<string, Activity[]>()
  for (const activity of activities) {
    const key = localDayKey(activity.date)
    if (!key) continue
    const list = byDay.get(key)
    if (list) list.push(activity)
    else byDay.set(key, [activity])
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id.localeCompare(b.id))
  }

  const gridStart = startOfWeek(new Date(year, month, 1))
  const gridEnd = addDays(startOfWeek(new Date(year, month + 1, 0)), 6)

  const monthTotals = { seconds: 0, meters: 0, elevation: 0, sessions: 0, days: 0 }
  const intensityDays: Record<Intensity, number> = { easy: 0, medium: 0, hard: 0 }
  let restDays = 0
  const weeks: WeekRow[] = []

  for (let cursor = new Date(gridStart); cursor.getTime() <= gridEnd.getTime(); cursor = addDays(cursor, 7)) {
    const monday = new Date(cursor)
    const weekActivities: Activity[] = []
    let isCurrent = false
    const days: DayCell[] = []

    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(monday, offset)
      const key = formatDayInput(date)
      const inMonth = date.getMonth() === month && date.getFullYear() === year
      const future = date.getTime() > todayStart.getTime()
      const isToday = key === todayKey
      if (isToday) isCurrent = true
      const sessions = future ? [] : (byDay.get(key) ?? [])
      const head = `${WEEKDAYS[offset]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`

      if (sessions.length === 0) {
        const live = inMonth && !future
        if (live) restDays += 1
        days.push({
          key,
          day: date.getDate(),
          inMonth,
          isToday,
          bg: live ? '#171B24' : '#0F1218',
          fg: live ? '#9AA3B5' : '#7D8699',
          ring: isToday ? 'inset 0 0 0 2px #E8EAF0' : live ? 'none' : 'inset 0 0 0 1px #1E2330',
          bars: null,
          sports: [],
          km: '',
          unit: '',
          tip: `${head} · ${future ? 'upcoming' : 'rest'}`,
          sessions: [],
        })
        continue
      }

      const lead = sessions.reduce((best, activity) => {
        const bestLevel = intensityOf(best, maxHr)
        const nextLevel = intensityOf(activity, maxHr)
        const bestRank = bestLevel === 'hard' ? 2 : bestLevel === 'medium' ? 1 : bestLevel === 'easy' ? 0 : -1
        const nextRank = nextLevel === 'hard' ? 2 : nextLevel === 'medium' ? 1 : nextLevel === 'easy' ? 0 : -1
        if (nextRank !== bestRank) return nextRank > bestRank ? activity : best
        return activity.distanceM > best.distanceM ? activity : best
      })
      const sports = sportsOnDay(sessions)
      const level = intensityOf(lead, maxHr)
      const palette = level ? INTENSITY_CELL[level] : null
      const totals = sum(sessions)
      const km = (totals.meters / 1000).toFixed(1)
      weekActivities.push(...sessions)
      if (inMonth) {
        monthTotals.seconds += totals.seconds
        monthTotals.meters += totals.meters
        monthTotals.elevation += totals.elevation
        monthTotals.sessions += totals.sessions
        monthTotals.days += 1
        if (level) intensityDays[level] += 1
      }
      days.push({
        key,
        day: date.getDate(),
        inMonth,
        isToday,
        bg: palette ? palette.bg : '#2A3140',
        fg: palette ? palette.fg : '#E8EAF0',
        ring: isToday ? 'inset 0 0 0 2px #E8EAF0' : 'none',
        bars: palette ? palette.bars : null,
        sports,
        km,
        unit: 'km',
        tip: `${head} · ${sports.map((sport) => SPORT_LABEL[sport]).join(', ')}${level ? ` · ${INTENSITY_LABEL[level]}` : ''} · ${km} km · ${formatHm(totals.seconds)} · ${Math.round(totals.elevation)} m`,
        sessions,
      })
    }

    const started = monday.getTime() <= todayStart.getTime()
    const week = sum(weekActivities)
    const sunday = addDays(monday, 6)
    weeks.push({
      id: formatDayInput(monday),
      label: `W${isoWeekNumber(monday)}`,
      range: rangeLabel(monday, sunday),
      isCurrent,
      border: isCurrent ? '#E8EAF0' : '#1E2330',
      metrics: [
        { label: 'Time', value: started ? formatHm(week.seconds) : '—', unit: '' },
        { label: 'Distance', value: started ? (week.meters / 1000).toFixed(1) : '—', unit: started ? 'km' : '' },
        { label: 'Sessions', value: started ? String(week.sessions) : '—', unit: '' },
        { label: 'Elevation', value: started ? Math.round(week.elevation).toLocaleString('en-US') : '—', unit: started ? 'm' : '' },
      ],
      days,
    })
  }

  const hasData = monthTotals.sessions > 0
  const km = monthTotals.meters / 1000
  const tiles: MonthTile[] = [
    {
      label: 'Time',
      value: hasData ? formatHm(monthTotals.seconds) : '—',
      unit: '',
      sub: hasData ? `avg ${formatHm(monthTotals.seconds / monthTotals.sessions)} per session` : 'No sessions yet',
    },
    {
      label: 'Distance',
      value: hasData ? km.toFixed(1) : '—',
      unit: hasData ? 'km' : '',
      sub: hasData ? `avg ${(km / monthTotals.sessions).toFixed(1)} km per session` : 'No sessions yet',
    },
    {
      label: 'Sessions',
      value: hasData ? String(monthTotals.sessions) : '—',
      unit: '',
      sub: hasData ? `${pluralDays(monthTotals.days)} with a session` : 'No sessions yet',
    },
    {
      label: 'Elevation',
      value: hasData ? Math.round(monthTotals.elevation).toLocaleString('en-US') : '—',
      unit: hasData ? 'm' : '',
      sub: hasData ? `${km > 0 ? Math.round(monthTotals.elevation / km) : 0} m per km` : 'No sessions yet',
    },
  ]

  return {
    title: `${MONTHS[month]} ${year}`,
    tiles,
    weeks,
    legend: INTENSITIES.map((id) => ({
      id,
      name: INTENSITY_LABEL[id],
      days: intensityDays[id],
      bg: INTENSITY_CELL[id].bg,
      fg: INTENSITY_CELL[id].fg,
      bars: INTENSITY_CELL[id].bars,
    })),
    restDays,
  }
}
