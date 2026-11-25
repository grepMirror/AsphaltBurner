import { useMemo, useState, type ReactNode } from 'react'
import { BaseChart } from './BaseChart'
import { Segment } from './Segment'
import type { BlockKind } from '../lib/blocks'
import { rangeLabel } from '../lib/calendar'
import { formatDistance, formatDuration } from '../lib/format'
import { weekOf, type PlannedSession } from '../lib/plan'
import { ZONE_BANDS, type ZoneBand, type ZoneStyle } from '../lib/load'
import { planStats, type PlanTotals, type StatWeek } from '../lib/planStats'
import { parseDay } from '../lib/period'
import { raceText, type PlanInfo } from '../lib/plans'
import type { Activity } from '../types'

/** Bar of a week that has no block type. */
const NO_BLOCK = '#6B7488'
const DONE = '#E8EAF0'
const GOOD = '#9DDBC0'

/** What the bars show: the block type of each week, or the estimated zones of its sessions. */
type Mode = 'blocks' | ZoneStyle
const MODES: { id: Mode; label: string }[] = [
  { id: 'blocks', label: 'Blocks' },
  { id: '3', label: '3 zones' },
  { id: '5', label: '5 zones' },
]

/** `zones` holds the planned km of every zone band of both styles (z1..z5, easy, medium, hard). */
type Row = StatWeek & { plannedKm: number; doneKm: number | null; kind: BlockKind | null; zones: Record<string, number> }

/** Planned km that fall in a zone. It can be under the planned km when a run stands in for a plan with no pace. */
function zoneTotal(row: Row): number {
  return row.zones.easy + row.zones.medium + row.zones.hard
}

/** Zone 1 to 5 meters as km in the bands of both styles. Zones 1 and 2 are easy, 3 is medium, 4 and 5 are hard. */
function zoneKm(zoneM: number[]): Record<string, number> {
  const km = zoneM.map((meters) => meters / 1000)
  return { z1: km[0], z2: km[1], z3: km[2], z4: km[3], z5: km[4], easy: km[0] + km[1], medium: km[2], hard: km[3] + km[4] }
}

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
        zones: zoneKm(week.zoneM),
      })),
    [data.weeks, kinds],
  )

  // Phone: name, ring, Realized, chart. Desktop: name and Realized on the left, ring and chart on the right.
  return (
    <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-6 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] lg:gap-x-8">
      <header className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-1 lg:row-start-1">
        <h1 className="font-display text-[34px] font-semibold leading-tight tracking-tight sm:text-[44px]">{info.name}</h1>
        {info.raceDate ? (
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">
            Run {parseDay(info.raceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {race ? ` · ${race}` : ''}
          </p>
        ) : null}
        {info.objective ? <p className="mt-3 text-sm leading-relaxed text-[#9AA3B5]">{info.objective}</p> : null}
      </header>
      <div className="flex lg:col-start-2 lg:row-start-1 lg:justify-end">
        <Gauge totals={totals} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#2A3140] px-5 py-8 text-center text-sm text-[#9AA3B5] col-span-2">
          No session yet. Plan sessions in the Plan tab and the volume of every week will show here.
        </p>
      ) : (
        <>
          <section aria-labelledby="realized-title" className="min-w-0 rounded-2xl border border-[#1E2330] bg-[#10131A] px-3.5 py-2 lg:col-start-1 lg:row-start-2 lg:self-center lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
            <h2 id="realized-title" className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5] max-lg:sr-only lg:text-center">
              Realized
            </h2>
            {/* Desktop: a T. Distance and sessions side by side, a line under them, the time centered below. */}
            <div className="grid lg:mt-2 lg:grid-cols-2">
              <Progress label="Distance" done={formatDistance(totals.doneM)} total={`≈ ${formatDistance(totals.plannedM)}`} ratio={ratio(totals.doneM, totals.plannedM)} className="lg:border-b lg:border-r" />
              <Progress label="Sessions" done={String(totals.sessionsDone)} total={String(totals.sessions)} ratio={ratio(totals.sessionsDone, totals.sessions)} className="max-lg:border-t lg:border-b" />
              <Progress label="Time" done={formatDuration(totals.doneSec)} total={formatDuration(totals.plannedSec)} ratio={ratio(totals.doneSec, totals.plannedSec)} className="max-lg:border-t lg:col-span-2" />
            </div>
            {totals.unknown > 0 ? (
              <p className="mt-2 text-xs text-[#9AA3B5]">
                {totals.unknown} {totals.unknown === 1 ? 'session has' : 'sessions have'} no pace to estimate its distance yet, so {totals.unknown === 1 ? 'it is' : 'they are'} left out of the km. Import runs with heart rate to get one.
              </p>
            ) : null}
          </section>

          <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-2">
            <VolumeChart rows={rows} raceLabel={data.raceLabel} />
          </div>
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
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#1E2330] bg-[#10131A] p-3 text-center lg:flex-row lg:gap-4 lg:py-3 lg:pl-3 lg:pr-5 lg:text-left" role="group" aria-label="Share of the plan realized">
      <svg viewBox="0 0 84 84" aria-hidden="true" className="h-[68px] w-[68px] shrink-0 -rotate-90 lg:h-[84px] lg:w-[84px]">
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
        <p className="font-display text-2xl font-semibold leading-none tabular-nums lg:text-3xl">{percent === null ? '—' : `${percent}%`}</p>
        <p className="mt-1 text-[11px] leading-tight text-[#9AA3B5] lg:mt-1.5 lg:text-xs">of the plan realized</p>
        {percent === null ? null : <p className="text-[11px] text-[#5A6275]">by {totals.basis}</p>}
      </div>
    </div>
  )
}

/** One KPI. On a phone a row of the card next to the ring, on a desktop a cell of the T. */
function Progress({ label, done, total, ratio: share, className = '' }: { label: string; done: string; total: string; ratio: number | null; className?: string }) {
  const width = share === null ? 0 : Math.min(100, Math.max(0, share * 100))
  return (
    <div className={`py-2 max-lg:border-[#1E2330] lg:border-[#2A3140] lg:px-2 lg:py-2.5 lg:text-center ${className}`}>
      <div className="flex items-baseline justify-between gap-2 lg:block">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">{label}</p>
        <p className="flex flex-wrap items-baseline gap-x-1 tabular-nums lg:mt-1 lg:justify-center">
          <span className="font-display text-base font-semibold lg:text-lg">{done}</span>
          <span className="text-xs text-[#9AA3B5]">/ {total}</span>
        </p>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#1E2330] lg:mx-auto lg:max-w-[7rem]" role="presentation">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: GOOD, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function VolumeChart({ rows, raceLabel }: { rows: Row[]; raceLabel: string | null }) {
  const [mode, setMode] = useState<Mode>('blocks')
  const bands = mode === 'blocks' ? null : ZONE_BANDS[mode]
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
        <Segment label="Bars" value={mode} options={MODES} onChange={setMode} />
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#C5CAD3]">
        {bands
          ? bands.map((band) => (
              <Key key={band.key} swatch={<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: band.color }} />}>
                {band.label}
              </Key>
            ))
          : used.map((kind) => (
              <Key key={kind.id} swatch={<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: kind.color }} />}>
                {kind.label}
              </Key>
            ))}
        {!bands && plain ? (
          <Key swatch={<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: NO_BLOCK }} />}>No block</Key>
        ) : null}
        <Key swatch={<span className="flex items-center"><span className="h-px w-2 bg-[#E8EAF0]" /><span className="h-2 w-2 rounded-full border border-[#10131A] bg-[#E8EAF0]" /><span className="h-px w-2 bg-[#E8EAF0]" /></span>}>Done</Key>
        <Key swatch={<span className="h-2.5 w-2.5 rounded-[3px] border border-white bg-white/10" />}>This week</Key>
        <Key swatch={<span className="h-2.5 w-2.5 rounded-[3px] bg-white/25" />}>Passed</Key>
      </ul>

      <BaseChart
        label="Estimated km per week"
        rows={rows}
        xKey="label"
        current={currentLabel}
        summary={summary}
        className="mt-4 h-56 sm:h-72 lg:h-[22rem]"
        yWidth={34}
        xInterval={0}
        bars={
          bands
            ? bands.map((band, index) => ({
                key: `zones.${band.key}`,
                color: band.color,
                stackId: 'zone',
                radius: index === bands.length - 1 ? ([4, 4, 0, 0] as [number, number, number, number]) : undefined,
              }))
            : [{ key: 'plannedKm', color: NO_BLOCK, colorOf: (row) => row.kind?.color ?? NO_BLOCK }]
        }
        lines={[{ key: 'doneKm', color: DONE }]}
        markers={raceLabel ? [{ x: raceLabel, label: 'Run', color: GOOD }] : undefined}
        // Weeks gone are shaded, this week is outlined.
        rowStyle={(row) => ({ opacity: row.state === 'past' ? 0.42 : row.state === 'current' ? 1 : 0.9, outline: row.state === 'current' ? '#FFFFFF' : undefined })}
        tooltip={(row) => <VolumeTip row={row} bands={bands} />}
      />
      {bands ? (
        <p className="mt-2 text-xs text-[#9AA3B5]">
          Zones are estimated from the pace of each step. A hard step with no pace follows the type of its session: VMA zone 5, Threshold and Grimpette zone 4, Long Run zone 2, EF zone 1.
        </p>
      ) : null}
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

function VolumeTip({ row, bands }: { row: Row; bands: ZoneBand[] | null }) {
  const monday = parseDay(row.week)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return (
    <>
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
      {bands && zoneTotal(row) > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-[#1E2330] pt-2">
          {bands.map((band) => (
            <li key={band.key} className="flex items-center gap-2 tabular-nums text-[#C5CAD3]">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: band.color }} />
              <span className="flex-1">{band.label}</span>
              {Math.round((row.zones[band.key] / zoneTotal(row)) * 100)}%
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
