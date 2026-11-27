import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { PAGE_INNER, SUBTAB_ICON, SUBTAB_ROW, subtabClass } from '../components/layout'
import { ContextMenu, menuPoint } from '../components/ContextMenu'
import { PlanPicker } from '../components/PlanPicker'
import { PlanStats } from '../components/PlanStats'
import { BlockTypesModal } from '../components/WeekTags'
import { addKind, clearPlanTags, kindsOf, loadBlocks, removeKind, runOf, saveBlocks, tagWeeks, tagsOf, weeksBetween, type BlockBook, type BlockKind } from '../lib/blocks'
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
  dailyKm,
  isSimple,
  loadPlan,
  newSession,
  savePlan,
  shiftWeek,
  simpleBlocks,
  tagOf,
  totalsText,
  weekFacts,
  weekOf,
  weekRuns,
  zone1Pace,
  type PlannedSession,
  type WeekFacts,
} from '../lib/plan'
import { formatDayInput, parseDay, startOfWeek } from '../lib/period'
import { activePlan, addPlan, loadBook, removePlan, saveBook, selectPlan, updatePlan, type PlanBook, type PlanDraft } from '../lib/plans'
import type { Activity } from '../types'

type Pane = 'week' | 'stats'
type Open = { mode: 'edit' | 'view'; session: PlannedSession; isNew: boolean }

/** What the week list needs to show block tags, and to change them. */
type Tagging = {
  /** Monday of week -> block kind id, for the active plan. */
  tags: Record<string, string>
  kinds: BlockKind[]
  /** Monday of the run day's week, if the plan has one. */
  raceWeek: string | null
  /** Open the block type window for these weeks. */
  onTag: (weeks: string[]) => void
  /** Remove the tag of these weeks, a whole block. */
  onClear: (weeks: string[]) => void
  /** A block was stretched or shrunk: it covered `run` and now covers `weeks`. */
  onStretch: (run: string[], weeks: string[], kindId: string) => void
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Plans, sessions and week tags of the active profile. The page is remounted when the profile changes. */
export function PlannerPage({ profileId, maxHr, restHr, method, split }: { profileId: string; maxHr: number; restHr: number; method: HrMethod; split: ZoneEdges }) {
  const { ready, activities } = useActivities()
  const [pane, setPane] = useState<Pane>('week')
  const [book, setBook] = useState(() => loadBook(profileId))
  const [sessionsOfAll, setSessionsOfAll] = useState(() => loadPlan(profileId))
  const [week, setWeek] = useState(() => weekOf(new Date()))
  const [shown, setShown] = useState(() => {
    const monday = parseDay(weekOf(new Date()))
    return { year: monday.getFullYear(), month: monday.getMonth() }
  })
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [open, setOpen] = useState<Open | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState(() => loadBlocks(profileId))
  const [typesFor, setTypesFor] = useState<string[] | null>(null)

  useEffect(() => {
    if (!calendarOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCalendarOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [calendarOpen])

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
  const byId = useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities])

  // Every tab reads the active plan. The other plans' sessions are kept untouched in storage.
  const info = activePlan(book)
  const plan = useMemo(() => sessionsOfAll.filter((session) => session.planId === info.id), [sessionsOfAll, info.id])
  const commit = (next: PlannedSession[]) =>
    setSessionsOfAll(savePlan(profileId, [...sessionsOfAll.filter((session) => session.planId !== info.id), ...next.map((session) => ({ ...session, planId: info.id }))]))
  const changeBook = (next: PlanBook) => setBook(saveBook(profileId, next))
  const switchPlan = (id: string) => {
    if (id === info.id) return
    changeBook(selectPlan(book, id))
    setOpen(null)
    setDetailId(null)
  }
  const createPlan = (draft: PlanDraft) => {
    changeBook(addPlan(book, draft).book)
    setOpen(null)
    setDetailId(null)
  }
  const deletePlan = (id: string) => {
    setSessionsOfAll(savePlan(profileId, sessionsOfAll.filter((session) => session.planId !== id)))
    changeBlocks(clearPlanTags(blocks, id))
    changeBook(removePlan(book, id))
    setOpen(null)
    setDetailId(null)
  }

  // Block tags of the active plan. A week without an entry has no tag.
  const tags = tagsOf(blocks, info.id)
  const raceWeek = info.raceDate ? weekOf(parseDay(info.raceDate)) : null
  const changeBlocks = (next: BlockBook) => setBlocks(saveBlocks(profileId, next))
  const tagState: Tagging = {
    tags,
    kinds: kindsOf(blocks),
    raceWeek,
    onTag: setTypesFor,
    onClear: (weeks) => changeBlocks(tagWeeks(blocks, info.id, weeks, null)),
    onStretch: (run, weeks, kindId) => changeBlocks(tagWeeks(tagWeeks(blocks, info.id, run, null), info.id, weeks, kindId)),
  }
  const shared = new Set((typesFor ?? []).map((item) => tags[item] ?? null))

  const upsert = (session: PlannedSession) => commit(plan.some((item) => item.id === session.id) ? plan.map((item) => (item.id === session.id ? session : item)) : [...plan, session])
  /** A run with no session becomes a completed EF session of its week, linked to the run. */
  const logAsEf = (run: Activity) =>
    upsert({ ...newSession(week, 'ef', info.id), blocks: simpleBlocks(Math.max(60, Math.round(run.movingSec / 60) * 60)), status: 'done', activityId: run.id })
  const goWeek = (next: string, follow = true) => {
    setWeek(next)
    if (!follow) return
    const monday = parseDay(next)
    setShown({ year: monday.getFullYear(), month: monday.getMonth() })
  }
  const shiftMonth = (delta: number) => {
    const date = new Date(shown.year, shown.month + delta, 1)
    setShown({ year: date.getFullYear(), month: date.getMonth() })
  }

  if (!ready) return <p className="calendar-page px-10 py-10 text-sm text-[#9AA3B5]">Loading saved sessions…</p>

  const detail = detailId ? (byId.get(detailId) ?? null) : null
  if (detail) {
    return (
      <Frame>
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
          activities={byId}
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
  const facts = weekFacts(plan, week, kmh, activities)

  const pickWeek = (next: string) => {
    goWeek(next, false)
    setCalendarOpen(false)
  }

  return (
    <Frame>
      <div className={`${PAGE_INNER} flex flex-col gap-6`}>
        <Panes
          pane={pane}
          onPane={setPane}
          picker={
            <PlanPicker
              book={book}
              sessionCount={(id) => sessionsOfAll.filter((session) => session.planId === id).length}
              onSelect={switchPlan}
              onCreate={createPlan}
              onUpdate={(id, draft) => changeBook(updatePlan(book, id, draft))}
              onDelete={deletePlan}
            />
          }
        />
        {pane === 'stats' ? (
          <PlanStats plan={plan} info={info} kmh={kmh} byId={byId} tags={tags} kinds={tagState.kinds} raceWeek={raceWeek} />
        ) : (
          <div className="flex items-start gap-8">
            <aside className="sticky top-16 hidden w-[340px] shrink-0 lg:block">
              <MonthList year={shown.year} month={shown.month} week={week} plan={plan} tagging={tagState} onMonth={shiftMonth} onWeek={pickWeek} />
            </aside>
            <div className="flex min-w-0 flex-1 flex-col gap-6">
            <WeekHeader week={week} km={dailyKm(activities, week)} onWeek={goWeek} onOpenCalendar={() => setCalendarOpen(true)} />
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
                    onDetach={() => upsert({ ...session, status: 'planned', activityId: null })}
                  />
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => setOpen({ mode: 'edit', session: newSession(week, 'ef', info.id), isNew: true })}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#2A3140] py-4 text-sm font-semibold text-[#9AA3B5] hover:border-[#4A5264] hover:text-[#E8EAF0]"
                  >
                    <span className="text-lg leading-none">+</span> Add session
                  </button>
                </li>
                {free.map((run) => (
                  <li key={run.id} className="flex items-center rounded-2xl border border-[#1E2330] bg-[#0F1218]">
                    <button type="button" onClick={() => setDetailId(run.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-2xl px-4 py-3.5 text-left hover:bg-white/[0.02]">
                      <SportIcon sport={run.sport} className="h-4 w-4 shrink-0 text-[#9AA3B5]" />
                      <span className="w-10 shrink-0 text-xs font-semibold uppercase text-[#9AA3B5]">{dayName(run.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{run.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-[#9AA3B5]">
                        {formatDistance(run.distanceM)} · {formatDuration(run.movingSec)}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Log this run as a completed EF session"
                      aria-label={`Log ${run.name} as an EF session`}
                      onClick={() => logAsEf(run)}
                      className="mx-2 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-white/5"
                      style={{ color: TAG_COLOR.ef }}
                    >
                      + EF
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            </div>
          </div>
        )}
      </div>
      {calendarOpen && pane === 'week' ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center lg:hidden" onClick={() => setCalendarOpen(false)}>
          <div role="dialog" aria-label="Calendar" className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-[22px] border border-[#1E2330] bg-[#10131A] p-4" onClick={(event) => event.stopPropagation()}>
            <MonthList year={shown.year} month={shown.month} week={week} plan={plan} tagging={tagState} onMonth={shiftMonth} onWeek={pickWeek} />
          </div>
        </div>
      ) : null}
      {typesFor ? (
        <BlockTypesModal
          book={blocks}
          weeks={typesFor.length}
          current={shared.size === 1 ? ([...shared][0] ?? null) : null}
          onClear={typesFor.some((item) => tags[item]) ? () => {
            changeBlocks(tagWeeks(blocks, info.id, typesFor, null))
            setTypesFor(null)
          } : null}
          onChoose={(kindId) => {
            changeBlocks(tagWeeks(blocks, info.id, typesFor, kindId))
            setTypesFor(null)
          }}
          onCreate={(label, color) => {
            const made = addKind(blocks, label, color)
            if (made.id === null) return
            changeBlocks(tagWeeks(made.book, info.id, typesFor, made.id))
            setTypesFor(null)
          }}
          onRemove={(kindId) => changeBlocks(removeKind(blocks, kindId))}
          onClose={() => setTypesFor(null)}
        />
      ) : null}
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="calendar-page min-h-[calc(100vh-3.5rem)] px-4 pb-12 pt-5 sm:px-8 sm:pt-8">
      <div className={PAGE_INNER}>{children}</div>
    </div>
  )
}

function Panes({ pane, onPane, picker }: { pane: Pane; onPane: (pane: Pane) => void; picker: ReactNode }) {
  const items: { id: Pane; label: string }[] = [
    { id: 'week', label: 'Plan' },
    { id: 'stats', label: 'Stats' },
  ]
  return (
    <div className="flex items-center justify-between gap-4">
      <div role="tablist" aria-label="Planner" className={SUBTAB_ROW}>
        {items.map((item) => {
          const on = pane === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={item.label}
              title={item.label}
              onClick={() => onPane(item.id)}
              className={subtabClass(on)}
            >
              <span className={SUBTAB_ICON}>{item.id === 'week' ? <PlanLed on={on} /> : <StatsLed on={on} />}</span>
              {/* Phone: icon only. The label comes back from the sm breakpoint up. */}
              <span className={`hidden sm:inline ${on ? 'border-b border-white pb-0.5' : 'border-b border-transparent pb-0.5'}`}>{item.label}</span>
            </button>
          )
        })}
      </div>
      {picker}
    </div>
  )
}

/** Same LED as the profile tabs: dim when off, lit with a glow when on. */
function PlanLed({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={on ? 'text-[#38bdf8] drop-shadow-[0_0_6px_rgba(56,189,248,0.95)]' : 'text-white/30'}>
      <rect x="2.2" y="3.2" width="11.6" height="10.4" rx="2" fill={on ? 'currentColor' : 'none'} fillOpacity={on ? 0.25 : 0} />
      <path d="M2.2 6.6h11.6M5.4 2v2.4M10.6 2v2.4" />
    </svg>
  )
}

function StatsLed({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true" className={on ? 'text-[#4ade80] drop-shadow-[0_0_6px_rgba(74,222,128,0.95)]' : 'text-white/30'}>
      <rect x="2.4" y="8.4" width="2.6" height="5" rx="0.6" fill={on ? 'currentColor' : 'none'} />
      <rect x="6.7" y="4.6" width="2.6" height="8.8" rx="0.6" fill={on ? 'currentColor' : 'none'} />
      <rect x="11" y="6.6" width="2.6" height="6.8" rx="0.6" fill={on ? 'currentColor' : 'none'} />
    </svg>
  )
}

function WeekHeader({ week, km, onWeek, onOpenCalendar }: { week: string; km: number[]; onWeek: (week: string) => void; onOpenCalendar: () => void }) {
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
          <button type="button" aria-label="Open calendar" onClick={onOpenCalendar} className="cal-btn grid h-10 w-10 place-items-center rounded-xl border border-[#262C3B] bg-[#12161E] text-[#E8EAF0] lg:hidden">
            <CalendarIcon />
          </button>
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
      <Kpi label="Distance" value={facts.meters == null ? '—' : `${facts.estimated ? '≈ ' : ''}${formatDistance(facts.meters)}`} />
      <Kpi label="Time" value={facts.seconds == null ? '—' : formatDuration(facts.seconds)} />
      <Kpi label="Elevation" value={`${Math.round(facts.elevationM).toLocaleString('en-US')} m`} />
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
  onDetach,
}: {
  session: PlannedSession
  kmh: number | null
  activity: Activity | null
  free: Activity[]
  onOpen: () => void
  onComplete: (activityId: string | null) => void
  onDelete: () => void
  onRestore: () => void
  /** Back to planned, without the run. */
  onDetach: () => void
}) {
  const [linking, setLinking] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
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
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              title={activity ? 'Right-click to detach the run from this session' : 'Right-click to mark as planned again'}
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect()
                setMenu({ x: box.left, y: box.bottom + 4 })
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu(menuPoint(event, event.currentTarget))
              }}
              className="flex select-none items-center gap-1.5 rounded-full bg-[#9DDBC0]/10 px-3 py-1.5 text-xs font-semibold text-[#9DDBC0] hover:bg-[#9DDBC0]/15 [-webkit-touch-callout:none]"
            >
              <CheckIcon />
              Completed
            </button>
          ) : cancelled ? (
            <button type="button" onClick={onRestore} className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#C5CAD3] hover:bg-white/5">
              Restore
            </button>
          ) : (
            <button
              type="button"
              aria-expanded={linking}
              onClick={() => setLinking((value) => !value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${linking ? 'bg-white/10 text-[#E8EAF0]' : 'bg-[#E8EAF0] text-[#0B0D12]'}`}
            >
              Mark as completed
            </button>
          )}
          <button type="button" aria-label="Delete session" onClick={onDelete} className="grid h-7 w-7 place-items-center rounded-full text-[#9AA3B5] hover:bg-white/5 hover:text-[#E7A3A3]">
            <BinIcon />
          </button>
        </div>
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Completed session"
          onClose={() => setMenu(null)}
          items={[{ label: activity ? 'Detach from run' : 'Mark as planned', icon: <UnlinkIcon />, onSelect: onDetach }]}
        />
      ) : null}
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

/** A block being stretched: the weeks it had, and the weeks it covers right now. */
type Stretch = { kind: string; edge: 'start' | 'end'; run: string[]; weeks: string[] }

function MonthList({
  year,
  month,
  week,
  plan,
  tagging,
  onMonth,
  onWeek,
}: {
  year: number
  month: number
  week: string
  plan: PlannedSession[]
  tagging: Tagging
  onMonth: (delta: number) => void
  onWeek: (week: string) => void
}) {
  const next = addMonth(year, month, 1)
  const rootRef = useRef<HTMLDivElement>(null)
  const stretchRef = useRef<Stretch | null>(null)
  const [stretch, setStretch] = useState<Stretch | null>(null)

  // While a block is stretched, the list shows the result before it is saved.
  const tags = useMemo(() => {
    if (!stretch) return tagging.tags
    const shown = { ...tagging.tags }
    for (const item of stretch.run) delete shown[item]
    for (const item of stretch.weeks) shown[item] = stretch.kind
    return shown
  }, [stretch, tagging.tags])

  // The week nearest to a height on the screen. The pointer is on the rail, not on a row, while stretching.
  const weekAt = (y: number): string | null => {
    let best: string | null = null
    let bestDistance = Infinity
    rootRef.current?.querySelectorAll<HTMLElement>('[data-week]').forEach((row) => {
      const box = row.getBoundingClientRect()
      const distance = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
      if (distance < bestDistance) {
        best = row.dataset.week ?? null
        bestDistance = distance
      }
    })
    return best
  }

  const begin = (kind: string, edge: 'start' | 'end', run: string[], event: ReactPointerEvent) => {
    event.preventDefault()
    // The root keeps the pointer even when the grip is redrawn under it.
    rootRef.current?.setPointerCapture(event.pointerId)
    const state: Stretch = { kind, edge, run, weeks: run }
    stretchRef.current = state
    setStretch(state)
  }
  const move = (event: ReactPointerEvent) => {
    const current = stretchRef.current
    const found = weekAt(event.clientY)
    if (!current || !found) return
    const first = current.run[0]
    const last = current.run[current.run.length - 1]
    // A block keeps at least one week: the edge cannot cross the other one.
    const weeks = current.edge === 'start' ? weeksBetween(found < last ? found : last, last) : weeksBetween(first, found > first ? found : first)
    if (weeks.join() === current.weeks.join()) return
    const updated = { ...current, weeks }
    stretchRef.current = updated
    setStretch(updated)
  }
  const finish = (event: ReactPointerEvent, save: boolean) => {
    const current = stretchRef.current
    if (!current) return
    stretchRef.current = null
    setStretch(null)
    if (rootRef.current?.hasPointerCapture(event.pointerId)) rootRef.current.releasePointerCapture(event.pointerId)
    if (save && current.weeks.join() !== current.run.join()) tagging.onStretch(current.run, current.weeks, current.kind)
  }

  const shared = { week, plan, tagging, tags, stretch, onBegin: begin, onWeek }
  return (
    <div
      ref={rootRef}
      className={`flex flex-col gap-6 ${stretch ? 'cursor-ns-resize select-none' : ''}`}
      onPointerMove={stretch ? move : undefined}
      onPointerUp={stretch ? (event) => finish(event, true) : undefined}
      onPointerCancel={stretch ? (event) => finish(event, false) : undefined}
    >
      <MonthPlan year={year} month={month} arrows onMonth={onMonth} {...shared} />
      <MonthPlan year={next.year} month={next.month} {...shared} />
    </div>
  )
}

function MonthPlan({
  year,
  month,
  week,
  plan,
  tagging,
  tags,
  stretch,
  arrows = false,
  onBegin,
  onMonth,
  onWeek,
}: {
  year: number
  month: number
  week: string
  plan: PlannedSession[]
  tagging: Tagging
  tags: Record<string, string>
  stretch: Stretch | null
  arrows?: boolean
  onBegin: (kind: string, edge: 'start' | 'end', run: string[], event: ReactPointerEvent) => void
  onMonth?: (delta: number) => void
  onWeek: (week: string) => void
}) {
  const title = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long' })
  const rows = weeksInMonth(year, month).map((monday) => ({
    monday,
    kind: tags[monday] ?? null,
    sessions: plan.filter((session) => session.week === monday && session.status !== 'cancelled'),
  }))
  // Consecutive weeks with the same block type share one rail.
  const groups: { kind: string | null; rows: typeof rows }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && row.kind !== null && last.kind === row.kind) last.rows.push(row)
    else groups.push({ kind: row.kind, rows: [row] })
  }
  const kindById = new Map(tagging.kinds.map((kind) => [kind.id, kind]))
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">{title}</h2>
        {arrows && onMonth ? (
          <div className="flex items-center gap-1">
            <NavButton label="Previous month" onClick={() => onMonth(-1)}>
              <Chevron left />
            </NavButton>
            <NavButton label="Next month" onClick={() => onMonth(1)}>
              <Chevron />
            </NavButton>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {groups.map((group) => {
          const kind = group.kind ? (kindById.get(group.kind) ?? null) : null
          const first = group.rows[0].monday
          const last = group.rows[group.rows.length - 1].monday
          const run = kind ? runOf(tags, first) : []
          return (
            <div key={first} className="group/week flex items-stretch gap-2">
              {kind ? (
                <BlockRail
                  kind={kind}
                  active={stretch !== null && stretch.kind === kind.id && stretch.weeks.includes(first)}
                  // A block that goes on in the other month has no grip on that side.
                  canStart={run[0] === first}
                  canEnd={run[run.length - 1] === last}
                  weeks={run.length}
                  onOpen={() => tagging.onTag(run)}
                  onDelete={() => tagging.onClear(run)}
                  onBegin={(edge, event) => onBegin(kind.id, edge, run, event)}
                />
              ) : (
                <span className="grid w-5 shrink-0 place-items-center">
                  <button
                    type="button"
                    aria-label={`Add a block type to ${weekRange(first)}`}
                    title="Add a block type"
                    onClick={() => tagging.onTag([first])}
                    className="grid h-5 w-5 place-items-center rounded-md text-[#9AA3B5] opacity-0 transition-opacity hover:bg-white/5 hover:text-[#E8EAF0] focus-visible:opacity-100 group-hover/week:opacity-100 [@media(hover:none)]:opacity-40"
                  >
                    <TagIcon />
                  </button>
                </span>
              )}
              <ul className="flex min-w-0 flex-1 flex-col gap-2">
                {group.rows.map((row) => {
                  const on = row.monday === week
                  return (
                    <li key={row.monday} data-week={row.monday}>
                      <button type="button" onClick={() => onWeek(row.monday)} className="flex w-full items-center gap-3 text-left">
                        <span className={`w-24 shrink-0 whitespace-nowrap text-xs leading-tight tabular-nums ${on ? 'text-[#E8EAF0]' : 'text-[#9AA3B5]'}`}>{weekRange(row.monday)}</span>
                        <span className={`flex min-h-10 flex-1 flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${on ? 'border-[#E8EAF0] bg-white/[0.04]' : 'border-[#1E2330] bg-[#0F1218] hover:border-[#3A4150]'}`}>
                          {row.sessions.map((session) => (
                            <span key={session.id} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: TAG_COLOR[session.tag], color: '#0B0D12' }}>
                              {tagOf(session.tag).label}
                            </span>
                          ))}
                          {row.monday === tagging.raceWeek ? <span className="ml-auto rounded-full border border-[#E8EAF0]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#E8EAF0]">Run day</span> : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Rail of a block: the type name and a line, both in the type's color.
 * Hovering tints it and shows a grip at each end: drag a grip to stretch the block over more weeks, or to shrink it.
 * Clicking it opens the block type window for the whole block. Right-click (or a long press) offers to delete the tag of the whole block.
 */
function BlockRail({
  kind,
  active,
  canStart,
  canEnd,
  weeks,
  onOpen,
  onDelete,
  onBegin,
}: {
  kind: BlockKind
  active: boolean
  canStart: boolean
  canEnd: boolean
  /** Weeks the whole block covers. */
  weeks: number
  onOpen: () => void
  onDelete: () => void
  onBegin: (edge: 'start' | 'end', event: ReactPointerEvent) => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const grip = (edge: 'start' | 'end') => (
    <span
      title="Drag to stretch the block"
      onPointerDown={(event) => onBegin(edge, event)}
      style={{ touchAction: 'none' }}
      className={`absolute -inset-x-1 z-10 flex h-4 cursor-ns-resize items-center justify-center transition-opacity ${edge === 'start' ? '-top-2' : '-bottom-2'} ${active ? 'opacity-100' : 'opacity-0 group-hover/rail:opacity-100 [@media(hover:none)]:opacity-70'}`}
    >
      <span className="h-1 w-3.5 rounded-full" style={{ background: kind.color }} />
    </span>
  )
  return (
    // Everything inside is absolute: the rail is exactly as tall as the weeks it covers, whatever the label length.
    <div className="group/rail relative w-5 shrink-0">
      <button
        type="button"
        aria-label={`${kind.label} block: change its type`}
        title={`${kind.label} · click to change, right-click to delete, drag an end to stretch`}
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu(menuPoint(event, event.currentTarget))
        }}
        className="absolute inset-0 overflow-hidden rounded-md outline-none focus-visible:ring-1 focus-visible:ring-white/40"
      >
        <span aria-hidden="true" className={`absolute inset-0 rounded-md transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover/rail:opacity-100'}`} style={{ background: `${kind.color}22` }} />
        <span aria-hidden="true" className="absolute inset-y-0 right-0.5 w-0.5 rounded-full" style={{ background: kind.color }} />
        <span className="absolute inset-y-0 left-0 right-1.5 flex items-center justify-center overflow-hidden py-1">
          <span className="max-h-full rotate-180 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.08em] [writing-mode:vertical-rl]" style={{ color: kind.color }}>
            {kind.label}
          </span>
        </span>
      </button>
      {canStart ? grip('start') : null}
      {canEnd ? grip('end') : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={`${kind.label} block`}
          onClose={() => setMenu(null)}
          items={[{ label: `Delete tag · ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`, icon: <BinIcon />, danger: true, onSelect: onDelete }]}
        />
      ) : null}
    </div>
  )
}

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8.2V3.4a.9.9 0 0 1 .9-.9h4.8l5.3 5.3a.9.9 0 0 1 0 1.3l-4.5 4.5a.9.9 0 0 1-1.3 0L2.5 8.2Z" />
      <circle cx="5.7" cy="5.7" r="0.9" />
    </svg>
  )
}

function addMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

function weeksInMonth(year: number, month: number): string[] {
  const start = startOfWeek(new Date(year, month, 1))
  const end = startOfWeek(new Date(year, month + 1, 0))
  const weeks: string[] = []
  for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 7)) {
    if (cursor.getFullYear() === year && cursor.getMonth() === month) weeks.push(formatDayInput(cursor))
  }
  return weeks
}

function weekRange(week: string): string {
  const monday = parseDay(week)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return rangeLabel(monday, sunday)
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
      <path d="M2.5 7.5h13M6 2.5v2M12 2.5v2" />
    </svg>
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

function UnlinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.6 9.4 5 11a2.1 2.1 0 0 1-3-3l2-2a2.1 2.1 0 0 1 3 0M9.4 6.6 11 5a2.1 2.1 0 0 1 3 3l-2 2a2.1 2.1 0 0 1-3 0M3 13 13 3" />
    </svg>
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
