import { useMemo, useState, type ReactNode } from 'react'
import { CheckIcon, SessionEditor, SessionViewer, TAG_COLOR, WorkoutStrip } from '../components/PlanSession'
import { SessionView } from '../components/SessionView'
import { SportIcon } from '../components/SportIcon'
import { useActivities } from '../lib/activities'
import { isoWeekNumber, rangeLabel } from '../lib/calendar'
import { formatDistance, formatDuration } from '../lib/format'
import { zoneCutBpm, type HrMethod, type ZoneEdges } from '../lib/intensity'
import { buildPaceCost } from '../lib/physiology'
import {
  blocksSummary,
  climbRatio,
  dailyKm,
  isSimple,
  loadPlan,
  newSession,
  savePlan,
  shiftWeek,
  tagOf,
  totalsText,
  weekFacts,
  weekOf,
  weekRuns,
  zone1Pace,
  type PlannedSession,
  type WeekFacts,
} from '../lib/plan'
import { formatDayInput, parseDay } from '../lib/period'
import type { Activity } from '../types'

type Pane = 'week' | 'stats'
type Open = { mode: 'edit' | 'view'; session: PlannedSession; isNew: boolean }

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function PlannerPage({ maxHr, restHr, method, split }: { maxHr: number; restHr: number; method: HrMethod; split: ZoneEdges }) {
  const { ready, activities } = useActivities()
  const [pane, setPane] = useState<Pane>('week')
  const [plan, setPlan] = useState(loadPlan)
  const [week, setWeek] = useState(() => weekOf(new Date()))
  const [open, setOpen] = useState<Open | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const pace = useMemo(() => {
    if (!ready) return null
    const now = Date.now()
    const cutoff = now - 90 * 24 * 60 * 60 * 1000
    const recent = activities.filter((activity) => {
      const time = new Date(activity.date).getTime()
      return time >= cutoff && time <= now
    })
    return zone1Pace(buildPaceCost(recent).points, zoneCutBpm(maxHr, split, { restHr, method })[0])
  }, [ready, activities, maxHr, restHr, method, split])
  const kmh = pace?.mid ?? null
  const climb = useMemo(() => (ready ? climbRatio(activities) : null), [ready, activities])
  const byId = useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities])

  const commit = (next: PlannedSession[]) => setPlan(savePlan(next))
  const upsert = (session: PlannedSession) => commit(plan.some((item) => item.id === session.id) ? plan.map((item) => (item.id === session.id ? session : item)) : [...plan, session])

  if (!ready) return <p className="calendar-page px-10 py-10 text-sm text-[#9AA3B5]">Loading saved sessions…</p>

  const detail = detailId ? (byId.get(detailId) ?? null) : null
  if (detail) {
    return (
      <Frame wide>
        <SessionView activity={detail} maxHr={maxHr} split={split} restHr={restHr} method={method} backLabel="← Back to session" onBack={() => setDetailId(null)} />
      </Frame>
    )
  }

  if (open?.mode === 'edit') {
    return (
      <Frame>
        <SessionEditor
          key={open.session.id}
          initial={open.session}
          isNew={open.isNew}
          plan={plan}
          pace={pace}
          onBack={() => setOpen(null)}
          onSave={(session) => {
            upsert(session)
            setOpen(null)
          }}
          onDelete={() => {
            commit(plan.filter((item) => item.id !== open.session.id))
            setOpen(null)
          }}
        />
      </Frame>
    )
  }

  if (open?.mode === 'view') {
    const session = plan.find((item) => item.id === open.session.id) ?? open.session
    return (
      <Frame>
        <SessionViewer
          session={session}
          activity={session.activityId ? (byId.get(session.activityId) ?? null) : null}
          kmh={kmh}
          onBack={() => setOpen(null)}
          onTag={(tag) => upsert({ ...session, tag })}
          onEdit={() => setOpen({ mode: 'edit', session, isNew: false })}
          onUncomplete={() => {
            upsert({ ...session, status: 'planned', activityId: null })
            setOpen(null)
          }}
          onOpenActivity={setDetailId}
        />
      </Frame>
    )
  }

  const sessions = plan.filter((session) => session.week === week)
  const linked = new Set(plan.map((session) => session.activityId).filter((id): id is string => id !== null))
  const free = weekRuns(activities, week).filter((run) => !linked.has(run.id))
  const facts = weekFacts(plan, week, kmh, climb, activities)

  return (
    <Frame>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Panes pane={pane} onPane={setPane} />
        {pane === 'stats' ? (
          <PlanStats plan={plan} />
        ) : (
          <>
            <WeekHeader week={week} km={dailyKm(activities, week)} onWeek={setWeek} />
            <section className="rounded-[22px] border border-[#1E2330] bg-[#10131A] p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Sessions</h2>
                  <p className="mt-0.5 text-xs text-[#9AA3B5]">
                    {facts.count === 0 ? (free.length === 0 ? 'Nothing planned' : `${free.length} ${free.length === 1 ? 'run' : 'runs'} this week`) : `${facts.done} of ${facts.count} completed`}
                  </p>
                </div>
                <WeekKpis facts={facts} />
              </div>
              <ul className="mt-5 flex flex-col gap-2">
                {sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    kmh={kmh}
                    activity={session.activityId ? (byId.get(session.activityId) ?? null) : null}
                    free={free}
                    onOpen={() => setOpen({ mode: session.status === 'done' ? 'view' : 'edit', session, isNew: false })}
                    onComplete={(activityId) => upsert({ ...session, status: 'done', activityId })}
                    onDelete={() => commit(plan.filter((item) => item.id !== session.id))}
                    onRestore={() => upsert({ ...session, status: 'planned' })}
                  />
                ))}
                {free.map((run) => (
                  <li key={run.id}>
                    <button type="button" onClick={() => setDetailId(run.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#1E2330] bg-[#0F1218] px-4 py-3.5 text-left hover:bg-white/[0.02]">
                      <SportIcon sport={run.sport} className="h-4 w-4 shrink-0 text-[#9AA3B5]" />
                      <span className="w-10 shrink-0 text-xs font-semibold uppercase text-[#9AA3B5]">{dayName(run.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{run.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-[#9AA3B5]">
                        {formatDistance(run.distanceM)} · {formatDuration(run.movingSec)}
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setOpen({ mode: 'edit', session: newSession(week), isNew: true })}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#2A3140] py-4 text-sm font-semibold text-[#9AA3B5] hover:border-[#4A5264] hover:text-[#E8EAF0]"
                  >
                    <span className="text-lg leading-none">+</span> Add session
                  </button>
                </li>
              </ul>
            </section>
          </>
        )}
      </div>
    </Frame>
  )
}

function Frame({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="calendar-page min-h-[calc(100vh-3.5rem)] px-4 pb-12 pt-5 sm:px-8 sm:pt-8">
      <div className={`mx-auto ${wide ? 'max-w-[1280px]' : 'max-w-3xl'}`}>{children}</div>
    </div>
  )
}

function Panes({ pane, onPane }: { pane: Pane; onPane: (pane: Pane) => void }) {
  const items: { id: Pane; label: string }[] = [
    { id: 'week', label: 'Plan' },
    { id: 'stats', label: 'Stats' },
  ]
  return (
    <div role="tablist" aria-label="Planner" className="flex gap-6">
      {items.map((item) => {
        const on = pane === item.id
        return (
          <button key={item.id} type="button" role="tab" aria-selected={on} onClick={() => onPane(item.id)} className={`border-b pb-1 text-sm ${on ? 'border-[#E8EAF0] text-[#E8EAF0]' : 'border-transparent text-[#9AA3B5] hover:text-[#E8EAF0]'}`}>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function WeekHeader({ week, km, onWeek }: { week: string; km: number[]; onWeek: (week: string) => void }) {
  const current = weekOf(new Date())
  const monday = parseDay(week)
  const sunday = parseDay(shiftWeek(week, 1))
  sunday.setDate(sunday.getDate() - 1)
  const relative = week === current ? 'This week' : week === shiftWeek(current, 1) ? 'Next week' : week === shiftWeek(current, -1) ? 'Last week' : null
  const todayIndex = week === current ? (new Date().getDay() + 6) % 7 : -1
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">
          {relative ?? monday.getFullYear()} · W{isoWeekNumber(monday)}
        </p>
        <h1 className="mt-2 font-display text-[34px] font-semibold leading-none tracking-tight sm:text-[44px]">{rangeLabel(monday, sunday)}</h1>
      </div>
      <div className="flex items-end gap-5">
        <WeekBars km={km} todayIndex={todayIndex} />
        <div className="flex items-center gap-1.5">
          <NavButton label="Previous week" onClick={() => onWeek(shiftWeek(week, -1))}>
            <Chevron left />
          </NavButton>
          {week === current ? null : (
            <button type="button" onClick={() => onWeek(current)} className="cal-btn h-10 rounded-xl border border-[#262C3B] bg-[#12161E] px-3 text-xs font-semibold text-[#E8EAF0]">
              Today
            </button>
          )}
          <NavButton label="Next week" onClick={() => onWeek(shiftWeek(week, 1))}>
            <Chevron />
          </NavButton>
        </div>
      </div>
    </div>
  )
}

function WeekBars({ km, todayIndex }: { km: number[]; todayIndex: number }) {
  const max = Math.max(...km, 1)
  const total = km.reduce((sum, value) => sum + value, 0)
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="sr-only">{`${total.toFixed(1)} km run this week`}</span>
      <div aria-hidden className="flex items-end gap-1.5">
        {km.map((value, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <div className="flex h-9 w-2.5 items-end">
              <span className="w-full rounded-[3px]" style={{ height: value > 0 ? `${Math.max(18, (value / max) * 100)}%` : '3px', background: value > 0 ? '#5EB0C8' : '#262C3B' }} />
            </div>
            <span className={`text-[9px] font-semibold ${index === todayIndex ? 'text-[#E8EAF0]' : 'text-[#5A6275]'}`}>{DAY_LETTERS[index]}</span>
          </div>
        ))}
      </div>
      <span aria-hidden className="text-[10px] tabular-nums text-[#9AA3B5]">
        {total > 0 ? `${total.toFixed(1)} km run` : 'No run yet'}
      </span>
    </div>
  )
}

function WeekKpis({ facts }: { facts: WeekFacts }) {
  const pct = facts.delta == null ? null : Math.round(facts.delta * 100)
  const tone = pct == null || pct === 0 ? '#9AA3B5' : pct > 0 ? '#9DDBC0' : '#E7A3A3'
  return (
    <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
      <Kpi label="Distance" value={facts.meters == null ? '—' : `${facts.count > 0 ? '≈ ' : ''}${formatDistance(facts.meters)}`} />
      <Kpi label="Time" value={facts.seconds == null ? '—' : formatDuration(facts.seconds)} />
      <Kpi label="Elevation" value={facts.elevationM == null ? '—' : `≈ ${Math.round(facts.elevationM).toLocaleString('en-US')} m`} />
      <Kpi label="Hard" value={String(facts.hard)} />
      <div className="flex flex-col">
        <dt className="text-[10px] uppercase tracking-[0.12em] text-[#9AA3B5]">{facts.deltaOf === 'time' ? 'Time vs last wk' : 'Vs last week'}</dt>
        <dd className="cal-num text-base font-semibold tabular-nums" style={{ color: tone }}>
          {pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct}%`}
        </dd>
      </div>
    </dl>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-[#9AA3B5]">{label}</dt>
      <dd className="cal-num text-base font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function SessionRow({
  session,
  kmh,
  activity,
  free,
  onOpen,
  onComplete,
  onDelete,
  onRestore,
}: {
  session: PlannedSession
  kmh: number | null
  activity: Activity | null
  free: Activity[]
  onOpen: () => void
  onComplete: (activityId: string | null) => void
  onDelete: () => void
  onRestore: () => void
}) {
  const [linking, setLinking] = useState(false)
  const color = TAG_COLOR[session.tag]
  const totals = totalsText(session.blocks, session.tag, kmh)
  const done = session.status === 'done'
  const cancelled = session.status === 'cancelled'

  return (
    <li className={`overflow-hidden rounded-2xl border bg-[#0F1218] ${linking ? 'border-[#3A4150]' : 'border-[#1E2330]'}`} style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
      <div className={`flex flex-col sm:flex-row sm:items-center ${cancelled ? 'opacity-45' : ''}`}>
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5 text-left hover:bg-white/[0.02]">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-baseline gap-2.5">
              <span className={`text-sm font-semibold ${cancelled ? 'line-through' : ''}`} style={{ color }}>
                {tagOf(session.tag).label}
              </span>
              <span className="cal-num text-sm font-semibold tabular-nums text-[#E8EAF0]">{totals.time}</span>
              <span className="text-sm tabular-nums text-[#9AA3B5]">{totals.distance}</span>
            </span>
            {isSimple(session.tag) ? null : <span className="truncate text-xs text-[#9AA3B5]">{blocksSummary(session.blocks)}</span>}
            {done && activity ? (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-[#C5CAD3]">
                <SportIcon sport={activity.sport} className="h-3.5 w-3.5" />
                <span className="truncate">
                  {activity.name} · {formatDistance(activity.distanceM)} · {formatDuration(activity.movingSec)}
                </span>
              </span>
            ) : null}
          </span>
          <WorkoutStrip blocks={session.blocks} tag={session.tag} kmh={kmh} small className="hidden w-24 shrink-0 sm:flex" />
        </button>
        <div className="flex shrink-0 items-center gap-1 px-4 pb-3 sm:pb-0 sm:pl-0 sm:pr-3">
          {done ? (
            <span className="flex items-center gap-1.5 rounded-full bg-[#9DDBC0]/10 px-3 py-1.5 text-xs font-semibold text-[#9DDBC0]">
              <CheckIcon />
              Completed
            </span>
          ) : cancelled ? (
            <button type="button" onClick={onRestore} className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#C5CAD3] hover:bg-white/5">
              Restore
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-expanded={linking}
                onClick={() => setLinking((value) => !value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${linking ? 'bg-white/10 text-[#E8EAF0]' : 'bg-[#E8EAF0] text-[#0B0D12]'}`}
              >
                Mark as completed
              </button>
              <button type="button" aria-label="Delete session" onClick={onDelete} className="grid h-7 w-7 place-items-center rounded-full text-[#9AA3B5] hover:bg-white/5 hover:text-[#E7A3A3]">
                <BinIcon />
              </button>
            </>
          )}
        </div>
      </div>
      {linking && !done && !cancelled ? (
        <div className="border-t border-[#1E2330] px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">Link a run from this week</p>
          {free.length === 0 ? (
            <p className="mt-2 text-sm text-[#9AA3B5]">No unlinked run this week.</p>
          ) : (
            <ul className="mt-1 divide-y divide-[#1E2330]">
              {free.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setLinking(false)
                      onComplete(run.id)
                    }}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:text-white"
                  >
                    <span className="w-10 shrink-0 text-xs font-semibold uppercase text-[#9AA3B5]">{dayName(run.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{run.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-[#9AA3B5]">
                      {formatDistance(run.distanceM)} · {formatDuration(run.movingSec)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setLinking(false)
              onComplete(null)
            }}
            className="mt-2 text-xs font-semibold text-[#9AA3B5] hover:text-[#E8EAF0]"
          >
            Complete without an activity
          </button>
        </div>
      ) : null}
    </li>
  )
}

function PlanStats({ plan }: { plan: PlannedSession[] }) {
  const weeks = [...new Set(plan.map((session) => session.week))].sort()
  return (
    <div className="mt-2">
      <h1 className="font-display text-[34px] font-semibold tracking-tight sm:text-[44px]">This plan</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-[#9AA3B5]">Estimated distance, time and load across the whole plan will show here.</p>
      <p className="mt-8 text-sm">
        {plan.length === 0 ? (
          <span className="text-[#9AA3B5]">No session yet.</span>
        ) : (
          <>
            {plan.length} {plan.length === 1 ? 'session' : 'sessions'}
            <span className="text-[#9AA3B5]">
              {' '}
              over {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} · from {formatDayInput(parseDay(weeks[0]))}
            </span>
          </>
        )}
      </p>
    </div>
  )
}

function dayName(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { weekday: 'short' })
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="cal-btn grid h-10 w-10 place-items-center rounded-xl border border-[#262C3B] bg-[#12161E] text-[#E8EAF0]">
      {children}
    </button>
  )
}

function BinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 4.5h9M6.2 4.4V3.2h3.6v1.2M4.4 4.5l.5 8.2h6.2l.5-8.2" />
    </svg>
  )
}

function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={left ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} />
    </svg>
  )
}
