import { localDayKey } from './calendar'
import { formatDistance } from './format'
import { formatDayInput, parseDay, startOfWeek } from './period'
import type { Activity } from '../types'

export const SESSION_TAGS = [
  { id: 'ef', label: 'EF' },
  { id: 'vma', label: 'VMA' },
  { id: 'long', label: 'Long Run' },
  { id: 'threshold', label: 'Threshold' },
  { id: 'climb', label: 'Grimpette' },
] as const

export type SessionTag = (typeof SESSION_TAGS)[number]['id']
export type PlanSport = 'run' | 'swim' | 'ride'
export type StepKind = 'warmup' | 'active' | 'recover'
export type Measure = 'time' | 'km'

/** `value` is seconds for time and metres for km. `pace` is seconds per km; null falls back to zone 1. */
export type Step = { kind: StepKind; by: Measure; value: number; pace: number | null }
/** `steps` may contain a nested block: one sub-interval level, deeper only if a saved plan already has it. */
export type Block = { repeat: number; steps: (Step | Block)[] }

export function isBlock(item: Step | Block): item is Block {
  return 'steps' in item
}
export type SessionStatus = 'planned' | 'done' | 'cancelled'

/** Sessions saved before plans existed have no plan id. They belong to the first plan. */
export const DEFAULT_PLAN_ID = 'main'

export type PlannedSession = {
  id: string
  /** The plan this session belongs to. */
  planId: string
  /** Monday of the week. A session floats inside its week, it has no day. */
  week: string
  sport: PlanSport
  tag: SessionTag
  blocks: Block[]
  status: SessionStatus
  activityId: string | null
}

export type Totals = { seconds: number | null; meters: number | null }
/** Speeds in km/h: 25th, 50th and 75th of the faster 70% of zone-1 time. */
export type ZonePace = { low: number; mid: number; high: number }

export type WeekFacts = {
  meters: number | null
  seconds: number | null
  elevationM: number | null
  hard: number
  count: number
  done: number
  delta: number | null
  deltaOf: 'distance' | 'time' | null
}

const KEY = 'asphaltburner.plan.v2'
const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000
const HARD: ReadonlySet<SessionTag> = new Set(['vma', 'threshold', 'climb'])
const KINDS: StepKind[] = ['warmup', 'active', 'recover']
const SPORTS: PlanSport[] = ['run', 'swim', 'ride']
const STATUSES: SessionStatus[] = ['planned', 'done', 'cancelled']

export function isHard(tag: SessionTag): boolean {
  return HARD.has(tag)
}

/** EF and Grimpette are one block of time or distance. Other tags get the workout creator. */
export function isSimple(tag: SessionTag): boolean {
  return tag === 'ef' || tag === 'climb'
}

export function tagOf(id: SessionTag) {
  return SESSION_TAGS.find((tag) => tag.id === id) ?? SESSION_TAGS[0]
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function weekOf(date: Date): string {
  return formatDayInput(startOfWeek(date))
}

export function shiftWeek(week: string, delta: number): string {
  const date = parseDay(week)
  date.setDate(date.getDate() + delta * 7)
  return formatDayInput(date)
}

export function weekDays(week: string): string[] {
  const monday = parseDay(week)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return formatDayInput(date)
  })
}

export function step(kind: StepKind, by: Measure, value: number, pace: number | null = null): Step {
  return { kind, by, value, pace }
}

export function simpleBlocks(seconds: number): Block[] {
  return [{ repeat: 1, steps: [step('active', 'time', seconds)] }]
}

export function defaultBlocks(tag: SessionTag): Block[] {
  if (tag === 'vma') {
    return [
      { repeat: 1, steps: [step('warmup', 'time', 1200)] },
      { repeat: 8, steps: [step('active', 'km', 400), step('recover', 'time', 90)] },
      { repeat: 1, steps: [step('recover', 'time', 600)] },
    ]
  }
  if (tag === 'threshold') {
    return [
      { repeat: 1, steps: [step('warmup', 'time', 900)] },
      { repeat: 3, steps: [step('active', 'time', 600), step('recover', 'time', 120)] },
      { repeat: 1, steps: [step('recover', 'time', 600)] },
    ]
  }
  return simpleBlocks(tag === 'long' ? 5400 : 2700)
}

export function newSession(week: string, tag: SessionTag = 'ef', planId: string = DEFAULT_PLAN_ID): PlannedSession {
  return { id: newId(), planId, week, sport: 'run', tag, blocks: defaultBlocks(tag), status: 'planned', activityId: null }
}

export function cloneBlocks(blocks: Block[]): Block[] {
  const copy = (block: Block): Block => ({ repeat: block.repeat, steps: block.steps.map((item) => (isBlock(item) ? copy(item) : { ...item })) })
  return blocks.map(copy)
}

function record(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
}

function cleanStep(raw: unknown): Step | null {
  const row = record(raw)
  const kind = KINDS.find((item) => item === row?.kind)
  if (!row || !kind) return null
  const by: Measure = row.by === 'km' ? 'km' : 'time'
  const value = Number(row.value)
  if (!Number.isFinite(value) || value <= 0) return null
  const pace = row.pace == null ? null : Number(row.pace)
  return {
    kind,
    by,
    value: Math.min(by === 'time' ? 6 * 3600 : 100_000, value),
    pace: pace !== null && Number.isFinite(pace) && pace >= 120 && pace <= 900 ? Math.round(pace) : null,
  }
}

function cleanItem(raw: unknown, depth: number): Step | Block | null {
  const row = record(raw)
  if (!row) return null
  // ponytail: 3 levels deep. The editor only adds one sub-interval.
  if (Array.isArray(row.steps)) return depth >= 3 ? null : cleanBlock(row, depth + 1)
  return cleanStep(row)
}

function cleanBlock(raw: unknown, depth = 0): Block | null {
  const row = record(raw)
  if (!row || !Array.isArray(row.steps)) return null
  const steps = row.steps.map((item) => cleanItem(item, depth)).filter((item): item is Step | Block => item !== null)
  if (steps.length === 0) return null
  const repeat = Math.round(Number(row.repeat))
  return { repeat: Number.isFinite(repeat) ? Math.min(50, Math.max(1, repeat)) : 1, steps }
}

function cleanSession(raw: unknown): PlannedSession | null {
  const row = record(raw)
  if (!row || typeof row.id !== 'string' || !row.id || typeof row.week !== 'string' || !DAY.test(row.week)) return null
  const tag = SESSION_TAGS.find((item) => item.id === row.tag)?.id
  if (!tag || !Array.isArray(row.blocks)) return null
  const blocks = row.blocks.map(cleanBlock).filter((item): item is Block => item !== null)
  if (blocks.length === 0) return null
  const status = STATUSES.find((item) => item === row.status) ?? 'planned'
  return {
    id: row.id,
    planId: typeof row.planId === 'string' && row.planId ? row.planId : DEFAULT_PLAN_ID,
    week: weekOf(parseDay(row.week)),
    sport: SPORTS.find((item) => item === row.sport) ?? 'run',
    tag,
    blocks,
    status,
    activityId: status === 'done' && typeof row.activityId === 'string' ? row.activityId : null,
  }
}

export function normalizePlan(raw: unknown): PlannedSession[] {
  if (!Array.isArray(raw)) return []
  const byId = new Map<string, PlannedSession>()
  for (const item of raw) {
    const session = cleanSession(item)
    if (session) byId.set(session.id, session)
  }
  return [...byId.values()]
}

export function loadPlan(): PlannedSession[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizePlan(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function savePlan(sessions: PlannedSession[]): PlannedSession[] {
  const next = normalizePlan(sessions)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* the plan still applies for this visit */
  }
  return next
}

/**
 * Zone 1 pace band: speed bins whose median heart rate sits under the zone 1 ceiling.
 * The slowest 30% of that time is dropped; the band is the faster 70%. Bins under a minute are ignored.
 */
export function zone1Pace(points: { speed: number; median: number | null; n: number }[], z1Bpm: number): ZonePace | null {
  const kept = points.filter((point) => point.median != null && point.n >= 60 && point.median < z1Bpm).sort((a, b) => a.speed - b.speed)
  const total = kept.reduce((sum, point) => sum + point.n, 0)
  if (total === 0) return null
  let skip = total * 0.3
  const fast: { speed: number; n: number }[] = []
  for (const point of kept) {
    if (skip >= point.n) {
      skip -= point.n
      continue
    }
    fast.push({ speed: point.speed, n: point.n - skip })
    skip = 0
  }
  const fastTotal = fast.reduce((sum, point) => sum + point.n, 0)
  if (fastTotal === 0) return null
  const at = (q: number) => {
    let seen = 0
    for (const point of fast) {
      seen += point.n
      if (seen >= fastTotal * q) return point.speed
    }
    return fast[fast.length - 1].speed
  }
  return { low: at(0.25), mid: at(0.5), high: at(0.75) }
}

/** ponytail: a step without a pace target runs at zone 1, so VMA reps by time read short; give each kind its own zone when targets matter. */
export function blockTotals(blocks: Block[], kmh: number | null): Totals {
  let seconds = 0
  let meters = 0
  let secondsKnown = true
  let metersKnown = true
  const add = (block: Block, times: number) => {
    const reps = times * block.repeat
    for (const item of block.steps) {
      if (isBlock(item)) {
        add(item, reps)
        continue
      }
      const speed = item.pace ? 1000 / item.pace : kmh ? kmh / 3.6 : null
      if (item.by === 'time') {
        seconds += item.value * reps
        if (speed) meters += speed * item.value * reps
        else metersKnown = false
      } else {
        meters += item.value * reps
        if (speed) seconds += (item.value / speed) * reps
        else secondsKnown = false
      }
    }
  }
  for (const block of blocks) add(block, 1)
  return { seconds: secondsKnown ? seconds : null, meters: metersKnown ? meters : null }
}

function sumTotals(sessions: PlannedSession[], kmh: number | null): Totals {
  let seconds: number | null = 0
  let meters: number | null = 0
  for (const session of sessions) {
    const totals = blockTotals(session.blocks, kmh)
    seconds = seconds === null || totals.seconds === null ? null : seconds + totals.seconds
    meters = meters === null || totals.meters === null ? null : meters + totals.meters
  }
  return { seconds, meters }
}

function live(plan: PlannedSession[], week: string): PlannedSession[] {
  return plan.filter((session) => session.week === week && session.status !== 'cancelled')
}

export function weekRuns(activities: Activity[], week: string): Activity[] {
  const days = weekDays(week)
  return activities
    .filter((activity) => {
      if (activity.sport !== 'run') return false
      const key = localDayKey(activity.date)
      return key !== null && key >= days[0] && key <= days[6]
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function dailyKm(activities: Activity[], week: string): number[] {
  const days = weekDays(week)
  const km = days.map(() => 0)
  for (const activity of weekRuns(activities, week)) {
    const index = days.indexOf(localDayKey(activity.date) ?? '')
    if (index >= 0) km[index] += activity.distanceM / 1000
  }
  return km
}

/** Cancelled sessions are left out. Percent is versus last week's plan, or last week's runs when nothing was planned. */
export function weekFacts(plan: PlannedSession[], week: string, kmh: number | null, climbPerMeter: number | null, activities: Activity[]): WeekFacts {
  const sessions = live(plan, week)
  const totals = sumTotals(sessions, kmh)
  const elevationM = totals.meters != null && totals.meters > 0 && climbPerMeter != null ? totals.meters * climbPerMeter : null
  let delta: number | null = null
  let deltaOf: WeekFacts['deltaOf'] = null
  if (sessions.length > 0) {
    const previous = shiftWeek(week, -1)
    const prev = live(plan, previous)
    const prevTotals = sumTotals(prev, kmh)
    if (totals.meters != null) {
      const base = prev.length > 0 ? prevTotals.meters : weekRuns(activities, previous).reduce((sum, run) => sum + run.distanceM, 0)
      if (base != null && base > 0) {
        delta = (totals.meters - base) / base
        deltaOf = 'distance'
      }
    } else if (totals.seconds != null && prevTotals.seconds != null && prev.length > 0 && prevTotals.seconds > 0) {
      delta = (totals.seconds - prevTotals.seconds) / prevTotals.seconds
      deltaOf = 'time'
    }
  }
  return {
    meters: totals.meters,
    seconds: totals.seconds,
    elevationM,
    hard: sessions.filter((session) => isHard(session.tag)).length,
    count: sessions.length,
    done: sessions.filter((session) => session.status === 'done').length,
    delta,
    deltaOf,
  }
}

/** What a run really did. Given for sessions that were marked done, so last week shows the run, not the plan. */
export type ActualRun = (activityId: string) => { seconds: number; meters: number } | null

/** Average of last week's sessions of one type. A done session counts as the run, any other as its plan. */
export function lastWeekMean(
  plan: PlannedSession[],
  week: string,
  tag: SessionTag,
  kmh: number | null,
  skipId?: string,
  actual?: ActualRun,
): { count: number; done: number; seconds: number | null; meters: number | null } | null {
  const list = live(plan, shiftWeek(week, -1)).filter((session) => session.tag === tag && session.id !== skipId)
  if (list.length === 0) return null
  let seconds: number | null = 0
  let meters: number | null = 0
  let done = 0
  for (const session of list) {
    const run = session.status === 'done' && session.activityId && actual ? actual(session.activityId) : null
    const totals = run ?? blockTotals(session.blocks, kmh)
    if (run) done += 1
    seconds = seconds === null || totals.seconds === null ? null : seconds + totals.seconds
    meters = meters === null || totals.meters === null ? null : meters + totals.meters
  }
  return {
    count: list.length,
    done,
    seconds: seconds == null ? null : seconds / list.length,
    meters: meters == null ? null : meters / list.length,
  }
}

/** Climb per metre, from runs in the last 90 days. Null under 5 km. ponytail: recent-run rate × estimated km, replace when a route exists. */
export function climbRatio(activities: Activity[], now = Date.now()): number | null {
  const cutoff = now - 90 * DAY_MS
  let meters = 0
  let climb = 0
  for (const activity of activities) {
    if (activity.sport !== 'run' || activity.distanceM < 1000) continue
    const time = new Date(activity.date).getTime()
    if (!Number.isFinite(time) || time < cutoff || time > now) continue
    meters += activity.distanceM
    climb += Math.max(0, activity.elevationM)
  }
  if (meters < 5000) return null
  return climb / meters
}

/** "1:30" is 90 s, "45" is 45 min, "1:05:00" is 65 min. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null
  const [a, b, c] = parts.map(Number)
  if (parts.length === 1) return a * 60
  if (parts.length === 2) return b < 60 ? a * 60 + b : null
  return b < 60 && c < 60 ? a * 3600 + b * 60 + c : null
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function formatSpan(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total}″`
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return s ? `${m}′${String(s).padStart(2, '0')}` : `${m}′`
}

export function formatMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${parseFloat((meters / 1000).toFixed(2))} km`
}

export function stepLabel(item: Step): string {
  return item.by === 'time' ? formatSpan(item.value) : formatMeters(item.value)
}

export function blockLabel(block: Block): string {
  const inner = block.steps.map((item) => (isBlock(item) ? blockLabel(item) : stepLabel(item))).join(' / ')
  if (block.repeat <= 1) return inner
  return `${block.repeat} × ${block.steps.length > 1 ? `(${inner})` : inner}`
}

export function blocksSummary(blocks: Block[]): string {
  return blocks.map(blockLabel).join(' · ')
}

/** The measure the athlete picked is exact; the other one is an estimate. */
export function totalsText(blocks: Block[], tag: SessionTag, kmh: number | null): { time: string; distance: string } {
  const totals = blockTotals(blocks, kmh)
  const head = blocks[0]?.steps[0]
  const byKm = isSimple(tag) && !!head && !isBlock(head) && head.by === 'km'
  const seconds = totals.seconds != null && totals.seconds >= 600 ? Math.round(totals.seconds / 60) * 60 : totals.seconds
  return {
    time: seconds == null ? '—' : `${byKm ? '≈ ' : ''}${formatSpan(seconds)}`,
    distance: totals.meters == null ? '—' : `${byKm ? '' : '≈ '}${formatDistance(totals.meters)}`,
  }
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('plan.ts')) {
  const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6
  const zone = zone1Pace(
    [
      { speed: 10, median: 110, n: 400 },
      { speed: 8, median: 100, n: 200 },
      { speed: 11, median: 115, n: 200 },
      { speed: 12, median: 140, n: 800 },
      { speed: 9, median: 105, n: 40 },
    ],
    120,
  )
  if (!zone || zone.low !== 10 || zone.mid !== 10 || zone.high !== 11) throw new Error(`zone ${JSON.stringify(zone)}`)
  if (zone1Pace([{ speed: 12, median: 140, n: 800 }], 120) !== null) throw new Error('zone high')

  const vma = defaultBlocks('vma')
  const plain = blockTotals(vma, 12)
  if (!near(plain.seconds, 3480) || !near(plain.meters, 11600)) throw new Error(`vma ${JSON.stringify(plain)}`)
  const targeted = cloneBlocks(vma)
  const rep = targeted[1].steps[0]
  if (isBlock(rep)) throw new Error('rep')
  rep.pace = 250
  const original = vma[1].steps[0]
  if (isBlock(original) || !near(blockTotals(targeted, 12).seconds, 3320) || original.pace !== null) throw new Error('pace target')
  const blind = blockTotals(vma, null)
  if (blind.seconds !== null || blind.meters !== null) throw new Error(`blind ${JSON.stringify(blind)}`)
  if (blocksSummary(vma) !== '20′ · 8 × (400 m / 1′30) · 10′') throw new Error(blocksSummary(vma))
  const nested = [{ repeat: 2, steps: [step('active', 'time', 60), { repeat: 3, steps: [step('active', 'km', 100)] }] }]
  const nestedTotals = blockTotals(nested, 12)
  if (!near(nestedTotals.seconds, 300) || !near(nestedTotals.meters, 1000) || blocksSummary(nested) !== '2 × (1′ / 3 × 100 m)') throw new Error(`nested ${blocksSummary(nested)} ${JSON.stringify(nestedTotals)}`)
  const ef = totalsText([{ repeat: 1, steps: [step('active', 'km', 10000)] }], 'ef', 12)
  if (ef.time !== '≈ 50′' || ef.distance !== '10 km') throw new Error(`ef ${JSON.stringify(ef)}`)

  if (parseClock('1:30') !== 90 || parseClock('45') !== 2700 || parseClock('1:05:00') !== 3900 || parseClock('1:75') !== null || parseClock('') !== null) throw new Error('clock')
  if (formatClock(90) !== '1:30' || formatClock(3900) !== '1:05:00' || formatSpan(3900) !== '1h05' || formatMeters(1500) !== '1.5 km') throw new Error('format')

  if (weekOf(new Date(2026, 10, 19)) !== '2026-11-16' || shiftWeek('2026-11-16', -1) !== '2026-11-09' || shiftWeek('2026-12-28', 1) !== '2027-01-04') throw new Error('week')

  const kept = normalizePlan([
    { id: 'a', week: '2026-11-18', sport: 'run', tag: 'ef', blocks: simpleBlocks(1800), status: 'done', activityId: 'x' },
    { id: 'b', week: 'nope', tag: 'ef', blocks: simpleBlocks(1800) },
    { id: 'c', week: '2026-11-16', tag: 'sprint', blocks: simpleBlocks(1800) },
    { id: 'd', week: '2026-11-16', tag: 'vma', blocks: [{ repeat: 99, steps: [{ kind: 'active', by: 'km', value: 400, pace: 10 }] }], status: 'planned', activityId: 'y' },
  ])
  const keptRep = kept[1]?.blocks[0]?.steps[0]
  // Sessions saved before plans existed join the first plan; a saved plan id is kept.
  const owned = normalizePlan([
    { id: 'old', week: '2026-11-16', tag: 'ef', blocks: simpleBlocks(1800) },
    { id: 'new', planId: 'race', week: '2026-11-16', tag: 'ef', blocks: simpleBlocks(1800) },
  ])
  if (owned[0].planId !== DEFAULT_PLAN_ID || owned[1].planId !== 'race') throw new Error(`plan ids ${JSON.stringify(owned.map((item) => item.planId))}`)
  if (kept.length !== 2 || kept[0].week !== '2026-11-16' || kept[0].activityId !== 'x' || kept[1].blocks[0].repeat !== 50 || !keptRep || isBlock(keptRep) || keptRep.pace !== null || kept[1].activityId !== null) {
    throw new Error(`norm ${JSON.stringify(kept)}`)
  }

  const session = (id: string, week: string, tag: SessionTag, minutes: number, status: SessionStatus = 'planned'): PlannedSession => ({
    id,
    planId: DEFAULT_PLAN_ID,
    week,
    sport: 'run',
    tag,
    blocks: simpleBlocks(minutes * 60),
    status,
    activityId: null,
  })
  const plan = [session('1', '2026-11-16', 'ef', 30), session('2', '2026-11-16', 'vma', 30), session('3', '2026-11-16', 'threshold', 60, 'cancelled'), session('4', '2026-11-09', 'ef', 30)]
  const both = weekFacts(plan, '2026-11-16', 12, 0.02, [])
  if (!near(both.meters, 12000) || both.hard !== 1 || both.count !== 2 || !near(both.elevationM, 240) || !near(both.delta, 1) || both.deltaOf !== 'distance') throw new Error(`both ${JSON.stringify(both)}`)
  const run = (date: string, distanceM: number, elevationM = 0): Activity => ({
    id: date,
    name: date,
    type: 'Run',
    sport: 'run',
    date,
    movingSec: 1000,
    elapsedSec: 1000,
    distanceM,
    elevationM,
    avgHr: 120,
    track: [],
    stream: [],
  })
  const fallback = weekFacts([session('1', '2026-11-16', 'ef', 60)], '2026-11-16', 12, null, [run('2026-11-09T12:00:00', 10000)])
  if (!near(fallback.delta, 0.2)) throw new Error(`fallback ${JSON.stringify(fallback)}`)
  const timed = weekFacts([session('1', '2026-11-16', 'ef', 70), session('4', '2026-11-09', 'ef', 50)], '2026-11-16', null, null, [])
  if (timed.meters !== null || !near(timed.delta, 0.4) || timed.deltaOf !== 'time') throw new Error(`timed ${JSON.stringify(timed)}`)
  const mean = lastWeekMean([session('a', '2026-11-09', 'ef', 40), session('b', '2026-11-09', 'ef', 60), session('c', '2026-11-09', 'vma', 30)], '2026-11-16', 'ef', 12)
  if (!mean || mean.count !== 2 || mean.done !== 0 || !near(mean.seconds, 3000) || !near(mean.meters, 10000)) throw new Error(`mean ${JSON.stringify(mean)}`)
  // a done session counts as the run: 40 min planned becomes 30 min / 6 km, the other stays at its plan (60 min, 12 km)
  const doneA = { ...session('a', '2026-11-09', 'ef', 40), status: 'done' as const, activityId: 'run-1' }
  const actualMean = lastWeekMean([doneA, session('b', '2026-11-09', 'ef', 60)], '2026-11-16', 'ef', 12, undefined, (id) => (id === 'run-1' ? { seconds: 1800, meters: 6000 } : null))
  if (!actualMean || actualMean.done !== 1 || !near(actualMean.seconds, 2700) || !near(actualMean.meters, 9000)) throw new Error(`actual mean ${JSON.stringify(actualMean)}`)
  // a done session whose run is gone falls back to its plan
  const lostMean = lastWeekMean([doneA], '2026-11-16', 'ef', 12, undefined, () => null)
  if (!lostMean || lostMean.done !== 0 || !near(lostMean.seconds, 2400)) throw new Error(`lost mean ${JSON.stringify(lostMean)}`)
  const daily = dailyKm([run('2026-11-16T08:00:00', 5000), run('2026-11-16T18:00:00', 3000), run('2026-11-22T08:00:00', 10000), run('2026-11-23T08:00:00', 7000)], '2026-11-16')
  if (daily.join() !== '8,0,0,0,0,0,10') throw new Error(`daily ${daily.join()}`)
  const now = new Date(2026, 10, 19, 12).getTime()
  const ratio = climbRatio([run('2026-11-01T12:00:00', 10000, 200), run('2026-10-01T12:00:00', 8000, 80), run('2026-08-01T12:00:00', 20000, 900)], now)
  if (!near(ratio, 280 / 18000)) throw new Error(`climb ${ratio}`)
}
