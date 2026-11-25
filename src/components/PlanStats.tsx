import { useMemo, useState, type ReactNode } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GRID, TICK } from './chartChrome'
import type { BlockKind } from '../lib/blocks'
import { rangeLabel } from '../lib/calendar'
import { formatDistance, formatDuration } from '../lib/format'
import { weekOf, type PlannedSession } from '../lib/plan'
import { planStats, type PlanTotals, type StatWeek } from '../lib/planStats'
import { parseDay } from '../lib/period'
import { raceText, type PlanInfo } from '../lib/plans'
import type { Activity } from '../types'

/** Bar of a week that has no block type. */
const NO_BLOCK = '#6B7488'
const DONE = '#E8EAF0'
const GOOD = '#9DDBC0'

type Row = StatWeek & { plannedKm: number; doneKm: number | null; kind: BlockKind | null }

/**
 * The stats of a plan: how much of it is done, and the volume of every week up to the run.
 * Bars are the planned km of a week in the color of its block type. Weeks already gone are dimmed, this week is outlined,
 * and a line follows what was really run.
 */
export function PlanStats({
  plan,
  info,
  kmh,
  byId,
  tags,
  kinds,
  raceWeek,
}: {
  plan: PlannedSession[]
  info: PlanInfo
  kmh: number | null
  byId: ReadonlyMap<string, Activity>
  tags: Record<string, string>
  kinds: BlockKind[]
  raceWeek: string | null
}) {
  const current = weekOf(new Date())
  const data = useMemo(() => planStats(plan, tags, raceWeek, kmh, byId, current), [plan, tags, raceWeek, kmh, byId, current])
  const race = raceText(info.raceDate)
  const { totals } = data

  const rows: Row[] = useMemo(
    () =>
      data.weeks.map((week) => ({
        ...week,
        plannedKm: week.plannedM / 1000,
        // The line stops today: a week to come has nothing done yet.
        doneKm: week.state === 'future' ? null : week.doneM / 1000,
        kind: kinds.find((kind) => kind.id === week.kindId) ?? null,
      })),
    [data.weeks, kinds],
  )

  return (
    <div className="mt-2 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-[16rem] max-w-xl flex-1">
          <h1 className="font-display text-[34px] font-semibold leading-tight tracking-tight sm:text-[44px]">{info.name}</h1>
          {info.raceDate ? (
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">
              Run {parseDay(info.raceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {race ? ` · ${race}` : ''}
            </p>
          ) : null}
          {info.objective ? <p className="mt-3 text-sm leading-relaxed text-[#9AA3B5]">{info.objective}</p> : null}
        </div>
        <Gauge totals={totals} />
      </header>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#2A3140] px-5 py-8 text-center text-sm text-[#9AA3B5]">
          No session yet. Plan sessions in the Plan tab and the volume of every week will show here.
        </p>
      ) : (
        <>
          <section aria-labelledby="realized-title">
            <h2 id="realized-title" className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">
              Realized
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Progress label="Distance" done={formatDistance(totals.doneM)} total={`≈ ${formatDistance(totals.plannedM)}`} ratio={ratio(totals.doneM, totals.plannedM)} />
              <Progress label="Sessions" done={String(totals.sessionsDone)} total={String(totals.sessions)} ratio={ratio(totals.sessionsDone, totals.sessions)} />
              <Progress label="Time" done={formatDuration(totals.doneSec)} total={formatDuration(totals.plannedSec)} ratio={ratio(totals.doneSec, totals.plannedSec)} />
            </div>
            {totals.unknown > 0 ? (
              <p className="mt-3 text-xs text-[#9AA3B5]">
                {totals.unknown} {totals.unknown === 1 ? 'session has' : 'sessions have'} no pace to estimate its distance yet, so {totals.unknown === 1 ? 'it is' : 'they are'} left out of the km. Import runs with heart rate to get one.
              </p>
            ) : null}
          </section>

          <VolumeChart rows={rows} raceLabel={data.raceLabel} />
        </>
      )}
    </div>
  )
}

function ratio(done: number, total: number): number | null {
  return total > 0 ? done / total : null
}

/** Ring with the share of the plan done. The ring stops at 100%, the number does not. */
function Gauge({ totals }: { totals: PlanTotals }) {
  const percent = totals.ratio === null ? null : Math.round(totals.ratio * 100)
  const fill = Math.min(1, Math.max(0, totals.ratio ?? 0))
  const radius = 34
  const length = 2 * Math.PI * radius
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#1E2330] bg-[#10131A] py-3 pl-3 pr-5" role="group" aria-label="Share of the plan realized">
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" className="shrink-0 -rotate-90">
        <circle cx="42" cy="42" r={radius} fill="none" stroke="#1E2330" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke={GOOD}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${length * fill} ${length}`}
          style={{ filter: fill > 0 ? 'drop-shadow(0 0 5px rgba(157,219,192,0.55))' : undefined, transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <div>
        <p className="font-display text-3xl font-semibold leading-none tabular-nums">{percent === null ? '—' : `${percent}%`}</p>
        <p className="mt-1.5 text-xs text-[#9AA3B5]">of the plan realized</p>
        {percent === null ? null : <p className="text-[11px] text-[#5A6275]">by {totals.basis}</p>}
      </div>
    </div>
  )
}

function Progress({ label, done, total, ratio: share }: { label: string; done: string; total: string; ratio: number | null }) {
  const width = share === null ? 0 : Math.min(100, Math.max(0, share * 100))
  return (
    <div className="rounded-2xl border border-[#1E2330] bg-[#10131A] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
        <span className="font-display text-2xl font-semibold">{done}</span>
        <span className="text-sm text-[#9AA3B5]">/ {total}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#1E2330]" role="presentation">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: GOOD, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function VolumeChart({ rows, raceLabel }: { rows: Row[]; raceLabel: string | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const used = useMemo(() => {
    const seen = new Map<string, BlockKind>()
    for (const row of rows) if (row.kind && !seen.has(row.kind.id)) seen.set(row.kind.id, row.kind)
    return [...seen.values()]
  }, [rows])
  const plain = rows.some((row) => row.kind === null)
  const currentLabel = rows.find((row) => row.state === 'current')?.label ?? null
  const summary = rows.map((row) => `${row.label} ${Math.round(row.plannedKm)} km planned`).join(', ')

  return (
    <section aria-labelledby="volume-title" className="rounded-[22px] border border-[#1E2330] bg-[#10131A] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="volume-title" className="font-display text-lg font-semibold">
          Estimated km per week
        </h2>
        <p className="text-xs text-[#9AA3B5]">
          {rows.length} {rows.length === 1 ? 'week' : 'weeks'}
        </p>
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#C5CAD3]">
        {used.map((kind) => (
          <Key key={kind.id} swatch={<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: kind.color }} />}>
            {kind.label}
          </Key>
        ))}
        {plain ? (
          <Key swatch={<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: NO_BLOCK }} />}>No block</Key>
        ) : null}
        <Key swatch={<span className="flex items-center"><span className="h-px w-2 bg-[#E8EAF0]" /><span className="h-2 w-2 rounded-full border border-[#10131A] bg-[#E8EAF0]" /><span className="h-px w-2 bg-[#E8EAF0]" /></span>}>Done</Key>
        <Key swatch={<span className="h-2.5 w-2.5 rounded-[3px] border border-white bg-white/10" />}>This week</Key>
        <Key swatch={<span className="h-2.5 w-2.5 rounded-[3px] bg-white/25" />}>Passed</Key>
      </ul>

      <p className="sr-only">{summary}</p>
      <div className="mt-4 h-56 sm:h-72" aria-hidden="true" onMouseLeave={() => setHover(null)}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: raceLabel ? 20 : 8, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="18%"
            onMouseMove={(state) => {
              const raw = state.activeTooltipIndex
              const index = typeof raw === 'number' ? raw : Number(raw)
              setHover(raw == null || raw === '' || !Number.isInteger(index) ? null : index)
            }}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={4}
              tick={(props: { x?: number | string; y?: number | string; payload?: { value?: string | number } }) => {
                const value = String(props.payload?.value ?? '')
                const now = value === currentLabel
                return (
                  <text x={Number(props.x)} y={Number(props.y) + 12} textAnchor="middle" fontSize={11} fontWeight={now ? 700 : 400} fill={now ? '#FFFFFF' : TICK.fill}>
                    {value}
                  </text>
                )
              }}
            />
            <YAxis width={34} tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(value: number) => String(value)} />
            <Tooltip content={(props) => <VolumeTip active={props.active} row={props.payload?.[0]?.payload as Row | undefined} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {raceLabel ? <ReferenceLine x={raceLabel} stroke={GOOD} strokeDasharray="3 3" label={{ value: 'Run', position: 'top', fill: GOOD, fontSize: 10, fontWeight: 600 }} /> : null}
            <Bar dataKey="plannedKm" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell
                  key={row.week}
                  fill={row.kind?.color ?? NO_BLOCK}
                  // Weeks gone are shaded, this week is outlined, and the hovered week stands out.
                  fillOpacity={hover !== null && hover !== index ? 0.28 : row.state === 'past' ? 0.42 : row.state === 'current' ? 1 : 0.9}
                  stroke={row.state === 'current' ? '#FFFFFF' : 'none'}
                  strokeWidth={row.state === 'current' ? 1.5 : 0}
                />
              ))}
            </Bar>
            <Line
              dataKey="doneKm"
              type="monotone"
              stroke={DONE}
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 3, fill: DONE, stroke: '#10131A', strokeWidth: 1.5 }}
              activeDot={{ r: 4.5, fill: DONE, stroke: '#10131A', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {swatch}
      {children}
    </li>
  )
}

function VolumeTip({ active, row }: { active?: boolean; row?: Row }) {
  if (!active || !row) return null
  const monday = parseDay(row.week)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return (
    <div className="min-w-[11rem] rounded-xl border border-[#2A3140] bg-[#0B0D12] px-3 py-2.5 text-xs shadow-xl">
      <p className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-[#E8EAF0]">
          {row.label}
          {row.state === 'current' ? <span className="ml-1.5 font-medium text-[#9DDBC0]">this week</span> : null}
        </span>
        <span className="text-[#9AA3B5]">{rangeLabel(monday, sunday)}</span>
      </p>
      <p className="mt-1 flex items-center gap-1.5" style={{ color: row.kind?.color ?? '#9AA3B5' }}>
        <span className="h-2 w-2 rounded-[2px]" style={{ background: row.kind?.color ?? NO_BLOCK }} />
        {row.kind?.label ?? 'No block'}
      </p>
      {row.sessions === 0 ? (
        <p className="mt-1.5 text-[#9AA3B5]">Nothing planned</p>
      ) : (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
          <dt className="text-[#9AA3B5]">Planned</dt>
          <dd className="text-right text-[#E8EAF0]">≈ {formatDistance(row.plannedM)} · {formatDuration(row.plannedSec)}</dd>
          {row.state === 'future' ? null : (
            <>
              <dt className="text-[#9AA3B5]">Done</dt>
              <dd className="text-right text-[#E8EAF0]">{formatDistance(row.doneM)} · {formatDuration(row.doneSec)}</dd>
            </>
          )}
          <dt className="text-[#9AA3B5]">Sessions</dt>
          <dd className="text-right text-[#E8EAF0]">
            {row.sessionsDone} / {row.sessions}
          </dd>
        </dl>
      )}
    </div>
  )
}
