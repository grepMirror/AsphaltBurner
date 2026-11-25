import { weeksBetween } from './blocks'
import { blockTotals, type PlannedSession } from './plan'
import type { Activity } from '../types'

export type WeekState = 'past' | 'current' | 'future'

/** One week of the plan chart. Meters and seconds are what the plan counts, `done*` what was really run. */
export type StatWeek = {
  /** Monday of the week. */
  week: string
  /** W1, W2, … from the first week of the plan. */
  label: string
  state: WeekState
  /** Block kind id of the week, null when untagged. */
  kindId: string | null
  plannedM: number
  doneM: number
  plannedSec: number
  doneSec: number
  sessions: number
  sessionsDone: number
}

export type PlanTotals = {
  plannedM: number
  doneM: number
  plannedSec: number
  doneSec: number
  sessions: number
  sessionsDone: number
  /** Sessions whose distance or time could not be estimated (no pace yet), so they count for nothing. */
  unknown: number
  /** Share of the plan done, 0 to 1 or more. Null when the plan is empty. */
  ratio: number | null
  basis: 'distance' | 'sessions'
}

export type PlanStatsData = { weeks: StatWeek[]; totals: PlanTotals; raceLabel: string | null }

/**
 * Every week of a plan, from its first session, tag or run week to its last, with what is planned and what is done.
 * A planned session counts for its plan. A completed one counts for its run in `done*` and for its plan in `planned*`,
 * so the bars show the volume of the whole plan and the line shows what was really done.
 * Cancelled sessions are left out.
 */
export function planStats(
  plan: PlannedSession[],
  tags: Record<string, string>,
  raceWeek: string | null,
  kmh: number | null,
  byId: ReadonlyMap<string, Activity>,
  currentWeek: string,
): PlanStatsData {
  const sessions = plan.filter((session) => session.status !== 'cancelled')
  const known = [...sessions.map((session) => session.week), ...Object.keys(tags), ...(raceWeek ? [raceWeek] : [])].sort()
  if (known.length === 0) return { weeks: [], totals: emptyTotals(), raceLabel: null }

  const days = weeksBetween(known[0], known[known.length - 1])
  const weeks: StatWeek[] = days.map((week, index) => ({
    week,
    label: `W${index + 1}`,
    state: week < currentWeek ? 'past' : week === currentWeek ? 'current' : 'future',
    kindId: tags[week] ?? null,
    plannedM: 0,
    doneM: 0,
    plannedSec: 0,
    doneSec: 0,
    sessions: 0,
    sessionsDone: 0,
  }))
  const byWeek = new Map(weeks.map((row) => [row.week, row]))
  const totals = emptyTotals()

  for (const session of sessions) {
    const row = byWeek.get(session.week)
    if (!row) continue
    const planned = blockTotals(session.blocks, kmh)
    const run = session.status === 'done' && session.activityId ? (byId.get(session.activityId) ?? null) : null
    const done = session.status === 'done'
    // Real figures stand in when the plan could not be estimated.
    const plannedM = planned.meters ?? run?.distanceM ?? 0
    const plannedSec = planned.seconds ?? run?.movingSec ?? 0
    if ((planned.meters === null || planned.seconds === null) && !run) totals.unknown += 1
    const doneM = run ? run.distanceM : done ? plannedM : 0
    const doneSec = run ? run.movingSec : done ? plannedSec : 0

    row.plannedM += plannedM
    row.plannedSec += plannedSec
    row.sessions += 1
    if (done) {
      row.doneM += doneM
      row.doneSec += doneSec
      row.sessionsDone += 1
    }
  }

  for (const row of weeks) {
    totals.plannedM += row.plannedM
    totals.doneM += row.doneM
    totals.plannedSec += row.plannedSec
    totals.doneSec += row.doneSec
    totals.sessions += row.sessions
    totals.sessionsDone += row.sessionsDone
  }
  if (totals.plannedM > 0) {
    totals.ratio = totals.doneM / totals.plannedM
    totals.basis = 'distance'
  } else if (totals.sessions > 0) {
    totals.ratio = totals.sessionsDone / totals.sessions
    totals.basis = 'sessions'
  }
  return { weeks, totals, raceLabel: raceWeek && byWeek.has(raceWeek) ? (byWeek.get(raceWeek)?.label ?? null) : null }
}

function emptyTotals(): PlanTotals {
  return { plannedM: 0, doneM: 0, plannedSec: 0, doneSec: 0, sessions: 0, sessionsDone: 0, unknown: 0, ratio: null, basis: 'distance' }
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('planStats.ts')) {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const session = (id: string, week: string, minutes: number, status: PlannedSession['status'] = 'planned', activityId: string | null = null): PlannedSession => ({
    id,
    planId: 'main',
    week,
    sport: 'run',
    tag: 'ef',
    blocks: [{ repeat: 1, steps: [{ kind: 'active', by: 'time', value: minutes * 60, pace: 360 }] }],
    status,
    activityId,
  })
  const run = { id: 'r1', distanceM: 9000, movingSec: 3300 } as Activity
  const byId = new Map([[run.id, run]])

  // 60 min at 6:00/km is 10 km. Week 1 is past, week 2 is the current one, week 3 is empty, week 4 holds the run.
  const plan = [
    session('a', '2026-11-02', 60, 'done', 'r1'),
    session('b', '2026-11-02', 30, 'cancelled'),
    session('c', '2026-11-09', 60),
    session('d', '2026-11-09', 30, 'done'),
    session('e', '2026-11-30', 60),
  ]
  const data = planStats(plan, { '2026-11-09': 'vma', '2026-11-16': 'threshold' }, '2026-11-30', 10, byId, '2026-11-09')
  if (data.weeks.map((row) => row.label).join() !== 'W1,W2,W3,W4,W5') throw new Error(`labels ${data.weeks.map((row) => row.label)}`)
  if (data.weeks.map((row) => row.state).join() !== 'past,current,future,future,future') throw new Error('states')
  if (data.weeks.map((row) => row.kindId).join() !== ',vma,threshold,,') throw new Error('kinds')
  if (data.raceLabel !== 'W5') throw new Error(`race ${data.raceLabel}`)
  const first = data.weeks[0]
  // the run replaces the plan in done, the plan stays in planned, the cancelled session is ignored
  if (!near(first.plannedM, 10000) || !near(first.doneM, 9000) || !near(first.doneSec, 3300) || first.sessions !== 1 || first.sessionsDone !== 1) throw new Error(`week 1 ${JSON.stringify(first)}`)
  // a completed session without a run counts for its plan
  const second = data.weeks[1]
  if (!near(second.plannedM, 15000) || !near(second.doneM, 5000) || second.sessions !== 2 || second.sessionsDone !== 1) throw new Error(`week 2 ${JSON.stringify(second)}`)
  if (data.weeks[2].sessions !== 0 || data.weeks[2].plannedM !== 0) throw new Error('empty week')
  if (!near(data.totals.plannedM, 35000) || !near(data.totals.doneM, 14000) || data.totals.sessions !== 4 || data.totals.sessionsDone !== 2) throw new Error(`totals ${JSON.stringify(data.totals)}`)
  if (data.totals.basis !== 'distance' || !near(data.totals.ratio ?? -1, 14000 / 35000)) throw new Error('ratio')
  if (!near(data.totals.plannedSec, 3600 * 3.5)) throw new Error(`hours ${data.totals.plannedSec}`)

  // without a pace a session cannot be estimated: it counts for nothing and is reported, unless its run is known
  const unpaced = planStats([session('x', '2026-11-02', 60), { ...session('y', '2026-11-02', 60, 'done', 'r1') }], {}, null, null, byId, '2026-11-02')
  const noPace = (s: PlannedSession): PlannedSession => ({ ...s, blocks: [{ repeat: 1, steps: [{ kind: 'active', by: 'time', value: 3600, pace: null }] }] })
  const lost = planStats([noPace(session('x', '2026-11-02', 60)), noPace(session('y', '2026-11-02', 60, 'done', 'r1'))], {}, null, null, byId, '2026-11-02')
  if (lost.totals.unknown !== 1 || !near(lost.totals.plannedM, 9000) || !near(lost.totals.doneM, 9000)) throw new Error(`unpaced ${JSON.stringify(lost.totals)}`)
  if (unpaced.totals.unknown !== 0) throw new Error('paced sessions are known')

  // by sessions when no distance can be told
  const bare = planStats([noPace(session('x', '2026-11-02', 60)), noPace(session('y', '2026-11-02', 60, 'done'))], {}, null, null, byId, '2026-11-02')
  if (bare.totals.basis !== 'sessions' || !near(bare.totals.ratio ?? -1, 0.5)) throw new Error(`bare ${JSON.stringify(bare.totals)}`)

  const empty = planStats([], {}, null, 10, byId, '2026-11-09')
  if (empty.weeks.length !== 0 || empty.totals.ratio !== null) throw new Error('empty plan')
  const onlyRace = planStats([], {}, '2026-11-30', 10, byId, '2026-11-09')
  if (onlyRace.weeks.length !== 1 || onlyRace.raceLabel !== 'W1') throw new Error('race only')
}
