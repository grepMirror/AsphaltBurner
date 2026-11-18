import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { GRID, TICK } from '../components/chartChrome'
import { Segment } from '../components/Segment'
import { formatDuration } from '../lib/format'
import { ZONE_BANDS, type ZoneStyle } from '../lib/load'
import { useActivities } from '../lib/activities'
import type { HrMethod, ZoneEdges } from '../lib/intensity'
import type { Activity } from '../types'
import { PACE_SOLID_SEC, buildHrBins, buildPaceCost, paceRows, paceWindows, zoneSlices, type HrBin, type PaceCompare, type PaceCost, type PaceRow, type PaceSpan, type ZoneSlice } from '../lib/physiology'

type ProfileTab = 'physiology' | 'speed' | 'uphill' | 'downhill'
type ChartId = 'pace' | 'hr'

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'physiology', label: 'Physiology' },
  { id: 'speed', label: 'Speed' },
  { id: 'uphill', label: 'Uphill' },
  { id: 'downhill', label: 'Downhill' },
]

export function ProfilePage({ maxHr, restHr, method, zones }: { maxHr: number; restHr: number; method: HrMethod; zones: ZoneEdges }) {
  const { ready, activities } = useActivities()
  const [tab, setTab] = useState<ProfileTab>('physiology')

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-2">
      <h1 className="sr-only">Profile</h1>
      <div role="tablist" aria-label="Profile" className="flex gap-2 overflow-x-auto">
        {TABS.map((item) => {
          const on = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? 'border-white/20 bg-white/[0.08] text-white' : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white'}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${on ? 'bg-[#f472b6] shadow-[0_0_8px_2px_rgba(244,114,182,0.9)]' : 'bg-[#2a3140] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]'}`} />
              {item.label}
            </button>
          )
        })}
      </div>
      {tab === 'physiology' ? <Physiology ready={ready} activities={activities} maxHr={maxHr} restHr={restHr} method={method} zones={zones} /> : null}
    </div>
  )
}

function Physiology({
  ready,
  activities,
  maxHr,
  restHr,
  method,
  zones,
}: {
  ready: boolean
  activities: ReturnType<typeof useActivities>['activities']
  maxHr: number
  restHr: number
  method: HrMethod
  zones: ZoneEdges
}) {
  const [front, setFront] = useState<ChartId>('pace')
  const [style, setStyle] = useState<ZoneStyle>('5')
  const [span, setSpan] = useState<PaceSpan>('90d')
  const [compare, setCompare] = useState<PaceCompare>('previous')
  const [year, setYear] = useState(() => new Date().getFullYear() - 1)
  const [allSpeeds, setAllSpeeds] = useState(false)
  const years = useMemo(() => {
    const today = new Date().getFullYear()
    let earliest = today
    for (const activity of activities) {
      const value = new Date(activity.date).getFullYear()
      if (value < earliest) earliest = value
    }
    const list: number[] = []
    for (let value = today - 1; value >= Math.min(earliest, today - 1); value -= 1) list.push(value)
    return list
  }, [activities])
  const windows = useMemo(() => paceWindows(span, compare, Date.now(), year), [span, compare, year])
  const pace = useMemo(() => (ready ? buildPaceCost(activitiesIn(activities, windows.start, windows.end)) : null), [ready, activities, windows])
  const prior = useMemo(() => (ready ? buildPaceCost(activitiesIn(activities, windows.compareStart, windows.compareEnd)) : null), [ready, activities, windows])
  const bins = useMemo(() => (ready ? buildHrBins(activities) : []), [ready, activities])
  const slices = useMemo(() => zoneSlices(bins, style, maxHr, restHr, zones, method), [bins, style, maxHr, restHr, zones, method])
  const swap = () => setFront((current) => (current === 'pace' ? 'hr' : 'pace'))

  if (!ready || !pace || !prior) return <p className="py-10 text-sm text-white/55">Loading saved sessions…</p>

  const paceCard = (compact = false) => (
    <PaceCard
      model={pace}
      prior={prior}
      span={span}
      compare={compare}
      year={year}
      years={years}
      allSpeeds={allSpeeds}
      onSpan={compact ? undefined : setSpan}
      onCompare={compact ? undefined : setCompare}
      onYear={compact ? undefined : setYear}
      onAllSpeeds={compact ? undefined : setAllSpeeds}
      compact={compact}
    />
  )

  return (
    <div className="grid items-start gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">
        {front === 'pace' ? paceCard() : <HrCard bins={bins} slices={slices} style={style} method={method} onStyle={setStyle} />}
      </div>
      <div className="relative min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/30">
        <button
          type="button"
          onClick={swap}
          aria-label={front === 'pace' ? 'Show heart-rate time as the main chart' : 'Show pace cost as the main chart'}
          className="absolute inset-0 z-0 rounded-xl"
        />
        <div className="pointer-events-none relative z-10">
          {front === 'pace' ? <HrCard bins={bins} slices={slices} style={style} method={method} compact /> : paceCard(true)}
        </div>
      </div>
    </div>
  )
}

function ChartNote({ label, align = 'left', children }: { label: string; align?: 'left' | 'right'; children: ReactNode }) {
  return (
    <details
      className="pointer-events-auto relative shrink-0"
      onToggle={(event) => {
        const panel = event.currentTarget.querySelector('div')
        if (!panel || !event.currentTarget.open) return
        const room = window.innerHeight - panel.getBoundingClientRect().top - 80
        panel.style.maxHeight = `${Math.max(96, room)}px`
      }}
    >
      <summary
        aria-label={label}
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-white/50 ring-1 ring-inset ring-white/25 marker:content-none [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="8" cy="4.6" r="0.75" fill="currentColor" />
        </svg>
      </summary>
      <div className={`absolute z-20 mt-2 max-h-[70vh] w-80 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-lg border border-white/15 bg-[#0b0e14] p-3 text-left text-xs leading-relaxed text-white/70 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}>
        {children}
      </div>
    </details>
  )
}

function activitiesIn(activities: Activity[], start: number, end: number): Activity[] {
  return activities.filter((activity) => {
    const time = new Date(activity.date).getTime()
    return time >= start && time < end
  })
}

function PaceCard({
  model,
  prior,
  span,
  compare,
  year,
  years,
  allSpeeds,
  onSpan,
  onCompare,
  onYear,
  onAllSpeeds,
  compact = false,
}: {
  model: PaceCost
  prior: PaceCost
  span: PaceSpan
  compare: PaceCompare
  year: number
  years: number[]
  allSpeeds: boolean
  onSpan?: (span: PaceSpan) => void
  onCompare?: (compare: PaceCompare) => void
  onYear?: (year: number) => void
  onAllSpeeds?: (all: boolean) => void
  compact?: boolean
}) {
  const rows = useMemo(() => paceRows(model.points, prior.points, allSpeeds), [model, prior, allSpeeds])
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [band, setBand] = useState<[number, number] | null>(null)
  const anchor = useRef<number | null>(null)
  const edge = useRef<number | null>(null)
  const scope = `${span}:${compare}:${year}:${allSpeeds}`
  const scopeSeen = useRef(scope)
  if (scopeSeen.current !== scope) {
    scopeSeen.current = scope
    if (zoom) setZoom(null)
  }
  const view = zoom ? rows.filter((point) => point.speed >= zoom[0] && point.speed <= zoom[1]) : rows
  const hrSource = view.length ? view : rows
  const shownLo = hrSource[0]?.speed ?? 0
  const shownHi = hrSource[hrSource.length - 1]?.speed ?? 1
  const domain: [number, number] = shownHi > shownLo ? [shownLo, shownHi] : [shownLo - 0.5, shownHi + 0.5]
  const hrSpan = hrSource.flatMap((point) => [point.p25, point.p25 !== null && point.iqr !== null ? point.p25 + point.iqr : null, point.median, point.medianThin, point.before, point.beforeThin]).filter((value): value is number => value !== null)
  const step = zoom ? 2 : 4
  const yDomain: [number, number] = hrSpan.length
    ? [Math.max(40, Math.floor((Math.min(...hrSpan) - step) / step) * step), Math.ceil((Math.max(...hrSpan) + step) / step) * step]
    : [40, 200]
  const speedAt = (index: number | string | null | undefined): number | null => {
    const at = typeof index === 'number' ? index : Number(index)
    if (!Number.isInteger(at) || at < 0 || at >= hrSource.length) return null
    return hrSource[at].speed
  }
  const begin = (state: { activeTooltipIndex?: number | string | null }) => {
    if (compact) return
    const speed = speedAt(state.activeTooltipIndex)
    if (speed === null) return
    anchor.current = speed
    edge.current = speed
    setBand([speed, speed])
  }
  const move = (state: { activeTooltipIndex?: number | string | null }) => {
    if (anchor.current === null) return
    const speed = speedAt(state.activeTooltipIndex)
    if (speed === null) return
    edge.current = speed
    setBand([anchor.current, speed])
  }
  const end = () => {
    const start = anchor.current
    const finish = edge.current
    anchor.current = null
    edge.current = null
    if (start === null) return
    setBand(null)
    if (finish === null || Math.abs(finish - start) < 0.5) return
    setZoom([Math.min(start, finish), Math.max(start, finish)])
  }
  const count = formatDuration(model.used)
  const spanLabel = span === '1y' ? 'year' : '90 days'
  const compareLabel = compare === 'year' ? 'same days last year' : compare === 'custom' ? `same days in ${year}` : span === '1y' ? 'previous year' : 'previous 90 days'
  const maxN = Math.max(1, ...hrSource.map((row) => row.n))
  const hasBefore = rows.some((row) => row.before !== null || row.beforeThin !== null)

  return (
    <section className={compact ? '' : 'rounded-xl border border-white/10 bg-white/[0.03] p-4'}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>What does your pace cost, in beats?</h2>
        <ChartNote label="How pace cost is built" align="right">
            <ul className="space-y-1.5">
              <li>Runs only. Each session is stored as at most 360 evenly spaced points. A point stands for the seconds until the next one, so a long run outweighs a short one. A gap over 3 minutes is dropped.</li>
              <li>Heart rate outside 40–230 bpm is dropped. A pace slower than 15:00/km or faster than 2:20/km is dropped.</li>
              <li>Points fall into 0.25 km/h bins. The line is the time-weighted median. The band is the 25th to 75th percentile of those same weights.</li>
              <li>One run is scaled until it is at most a quarter of the time in that bin. The sample count stays the raw number of points.</li>
              <li>A pace is drawn only when this period has at least 20 samples and both periods have at least 3 different runs. Under 60 seconds the line fades and the band stays off.</li>
              <li>Slower than 8:00/km, and the thin fast tail, stay off unless All speeds is on.</li>
              <li>The beats-per-km/h figure fits bins with at least 60 seconds, weighted by raw time, so a long run can still pull it after the quarter cap.</li>
              <li>No correction for hills, heat, or fatigue. A session with no FIT file is missing.</li>
            </ul>
          </ChartNote>
      </div>
      {!compact ? (
        <p className="mt-1 text-xs text-white/45">
          Last {spanLabel} · {compareLabel} · {count} · {model.bands} bands
          {model.slope === null ? '' : ` · ${formatSlope(model.slope)}`}
        </p>
      ) : null}
      {!compact && onSpan && onCompare && onYear && onAllSpeeds ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segment
            label="Period"
            value={span}
            options={[
              { id: '90d', label: '90d' },
              { id: '1y', label: '1y' },
            ]}
            onChange={onSpan}
          />
          <Segment
            label="Compare to"
            value={compare}
            options={[
              { id: 'previous', label: 'Previous' },
              { id: 'year', label: 'Last year' },
              { id: 'custom', label: 'Year' },
            ]}
            onChange={onCompare}
          />
          {compare === 'custom' ? (
            <details className="relative">
              <summary aria-label="Comparison year" className="flex cursor-pointer list-none items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-white marker:content-none [&::-webkit-details-marker]:hidden">
                {year}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <path d="M2 3.5 5 6.5 8 3.5" />
                </svg>
              </summary>
              <div className="absolute left-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-md border border-white/10 bg-[#12161E] py-1 shadow-lg">
                {years.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Comparison year ${option}`}
                    onClick={(event) => {
                      onYear(option)
                      event.currentTarget.closest('details')?.removeAttribute('open')
                    }}
                    className={`block w-full px-3 py-1 text-left text-xs ${option === year ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          <button
            type="button"
            aria-pressed={allSpeeds}
            onClick={() => onAllSpeeds(!allSpeeds)}
            className={`rounded px-2.5 py-1.5 text-xs ${allSpeeds ? 'bg-white/15 text-white' : 'text-white/55'}`}
          >
            All speeds
          </button>
          {zoom ? (
            <button type="button" onClick={() => setZoom(null)} className="rounded px-2.5 py-1.5 text-xs text-white/80">
              Reset zoom
            </button>
          ) : null}
        </div>
      ) : null}
      {model.points.length === 0 ? <p className="mt-6 text-sm text-[#9AA3B5]">No speed and heart-rate samples in this period.</p> : null}
      {model.points.length > 0 && rows.length === 0 ? <p className="mt-6 text-sm text-[#9AA3B5]">No pace has 20 samples and 3 runs on both sides.</p> : null}
      {rows.length > 0 ? (
        <div role="group" aria-label="Pace cost chart" className={compact ? 'mt-2 h-36 overflow-hidden' : 'mt-4 h-[260px] cursor-crosshair select-none overflow-hidden sm:h-[360px]'}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={hrSource}
              margin={{ top: compact ? 4 : 16, right: 8, left: 0, bottom: 0 }}
              onMouseDown={begin}
              onMouseMove={move}
              onMouseUp={end}
              onMouseLeave={end}
              onDoubleClick={() => setZoom(null)}
              onTouchStart={begin}
              onTouchMove={move}
              onTouchEnd={end}
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              {compact ? null : (
                <XAxis xAxisId="pace" dataKey="speed" type="number" domain={domain} allowDataOverflow orientation="top" tick={TICK} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value: number) => paceLabel(value)} />
              )}
              <XAxis xAxisId="speed" dataKey="speed" type="number" domain={domain} allowDataOverflow tick={TICK} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value: number) => value.toFixed(1)} />
              <YAxis width={36} domain={yDomain} allowDataOverflow tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(value)}`} />
              {compact ? null : <Tooltip axisId="speed" content={(props) => <PaceTip {...props} />} cursor={{ stroke: 'rgba(255,255,255,0.35)' }} />}
              {band && band[0] !== band[1] ? (
                <ReferenceArea xAxisId="speed" x1={Math.min(band[0], band[1])} x2={Math.max(band[0], band[1])} fill="#f472b6" fillOpacity={0.12} stroke="none" />
              ) : null}
              <Area xAxisId="speed" dataKey="p25" stackId="band" stroke="none" fill="transparent" connectNulls={false} isAnimationActive={false} legendType="none" tooltipType="none" />
              <Area xAxisId="speed" dataKey="iqr" stackId="band" stroke="none" fill="#9d174d" fillOpacity={0.55} connectNulls={false} isAnimationActive={false} legendType="none" tooltipType="none" />
              <Line xAxisId="speed" type="monotone" dataKey="beforeThin" stroke="#a8a29e" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
              <Line xAxisId="speed" type="monotone" dataKey="before" stroke="#a8a29e" strokeWidth={1.25} strokeDasharray="4 3" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
              <Line xAxisId="speed" type="monotone" dataKey="medianThin" stroke="#f472b6" strokeOpacity={0.35} strokeWidth={1.5} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
              <Line xAxisId="speed" type="monotone" dataKey="median" stroke="#f472b6" strokeWidth={2} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {!compact && rows.length > 0 ? (
        <div className="mt-1 flex h-4 items-end gap-px" style={{ marginLeft: 36, marginRight: 8 }} aria-hidden>
          {hrSource.map((row) => (
            <span
              key={row.speed}
              className="min-w-0 flex-1 rounded-t-sm bg-[#f472b6]"
              style={{
                height: row.n > 0 ? `${Math.max(12, Math.round(Math.sqrt(row.n / maxN) * 100))}%` : 0,
                opacity: row.n >= PACE_SOLID_SEC ? 0.9 : 0.3,
              }}
            />
          ))}
        </div>
      ) : null}
      {!compact && rows.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#9AA3B5]">
            <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-[#f472b6]" />This {spanLabel}</span>
            <span className="flex items-center gap-2"><span className="h-2.5 w-4 rounded-sm bg-[#9d174d]" />25th–75th</span>
            {hasBefore ? (
              <span className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-[#a8a29e]" />{compare === 'custom' ? String(year) : compare === 'year' ? 'Last year' : 'Previous'}</span>
            ) : null}
            <span className="ml-auto">Pace on top · km/h below</span>
          </div>
          <p className="mt-2 text-xs text-white/40">
            {!allSpeeds ? 'Slower than 8:00/km and the thin fast tail are hidden. ' : null}
            A pace needs 20 samples now and 3 runs on both sides. One run counts for at most a quarter of the time. Drag a pace range to zoom.
          </p>
        </>
      ) : null}
    </section>
  )
}

function HrCard({
  bins,
  slices,
  style,
  method,
  onStyle,
  compact = false,
}: {
  bins: HrBin[]
  slices: ZoneSlice[]
  style: ZoneStyle
  method: HrMethod
  onStyle?: (style: ZoneStyle) => void
  compact?: boolean
}) {
  const total = slices.reduce((sum, slice) => sum + slice.seconds, 0)
  const rows = useMemo(() => hrRows(bins, slices), [bins, slices])
  const lo = bins[0]?.hr ?? 0
  const hi = bins.length ? bins[bins.length - 1].hr + 2 : 1

  return (
    <section className={compact ? '' : 'rounded-xl border border-white/10 bg-white/[0.03] p-4'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>Time at each heart rate</h2>
            <ChartNote label="How heart-rate time is built">
                <ul className="space-y-1.5">
                  <li>All runs, not the period on the pace chart. Same 360-point streams. Time is the gap to the next sample. A gap over 3 minutes is dropped.</li>
                  <li>Both ends of a gap must be 40–230 bpm. Each bin is 2 bpm wide.</li>
                  <li>{method === 'karvonen' ? 'Zones use heart-rate reserve: rest plus your percents of (max − rest). Rest stays at least 30 bpm under max.' : 'Zones are a percent of max heart rate.'} Three zones fold five: 1–2 easy, 3 medium, 4–5 hard.</li>
                  <li>There is no per-run cap and no minimum sample count. A session with no FIT file is missing. The CSV average heart rate is not used.</li>
                </ul>
              </ChartNote>
          </div>
          {!compact ? <p className="mt-1 text-xs text-white/45">All running history · 2 bpm bins · {method === 'karvonen' ? 'FCR' : '% max'}</p> : null}
        </div>
        {!compact && onStyle ? (
          <Segment
            label="Zone grouping"
            value={style}
            options={[
              { id: '5', label: '5 zones' },
              { id: '3', label: '3 zones' },
            ]}
            onChange={onStyle}
          />
        ) : null}
      </div>
      {total <= 0 ? <p className="mt-6 text-sm text-[#9AA3B5]">No heart-rate samples in running sessions.</p> : null}
      {total > 0 ? (
        <div className={compact ? 'mt-2 h-36' : 'mt-4 h-[260px] sm:h-[360px]'}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="hr" type="number" domain={[lo, hi]} tick={TICK} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis width={40} domain={[0, 'auto']} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatTimeTick(value)} />
              {compact ? null : <Tooltip content={(props) => <HrTip {...props} />} cursor={{ stroke: 'rgba(255,255,255,0.35)' }} />}
              {slices.map((slice) => {
                const from = Math.max(slice.from ?? lo, lo)
                const to = Math.min(slice.to ?? hi, hi)
                if (to <= from) return null
                return <ReferenceArea key={slice.key} x1={from} x2={to} fill={slice.color} fillOpacity={0.1} stroke="none" />
              })}
              {ZONE_BANDS[style].map((band) => (
                <Area key={band.key} dataKey={band.key} type="monotone" stroke={band.color} fill={band.color} fillOpacity={0.35} strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {!compact && total > 0 ? (
        <ul className="mt-3 space-y-1">
          {slices.map((slice) => {
            const percent = Math.round((slice.seconds / total) * 100)
            return (
              <li key={slice.key} className="flex items-center gap-2 text-xs text-white/70">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: slice.color }} />
                <span className="w-16 font-semibold">{slice.label}</span>
                <span className="w-28 text-[#9AA3B5]">{rangeLabel(slice)}</span>
                <span className="tabular-nums text-[#E8EAF0]">{formatDuration(slice.seconds)}</span>
                <span className="text-[#9AA3B5]">{percent}%</span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

function hrRows(bins: HrBin[], slices: ZoneSlice[]) {
  return bins.map((bin, index) => {
    const row: Record<string, number | null> = { hr: bin.hr, seconds: bin.seconds }
    for (const slice of slices) row[slice.key] = null
    const key = sliceKeyAt(bin.hr + 1, slices)
    if (key) row[key] = bin.seconds
    if (index > 0) {
      const previous = sliceKeyAt(bins[index - 1].hr + 1, slices)
      if (previous && previous !== key) row[previous] = row.seconds
    }
    return row
  })
}

function sliceKeyAt(hr: number, slices: ZoneSlice[]): string {
  for (const slice of slices) {
    if ((slice.from === null || hr >= slice.from) && (slice.to === null || hr < slice.to)) return slice.key
  }
  return slices[slices.length - 1]?.key ?? ''
}

function rangeLabel(slice: ZoneSlice): string {
  const from = slice.from === null ? null : Math.round(slice.from)
  const to = slice.to === null ? null : Math.round(slice.to)
  if (from === null && to !== null) return `under ${to} bpm`
  if (from !== null && to === null) return `${from}+ bpm`
  if (from !== null && to !== null) return `${from}–${to} bpm`
  return ''
}

function paceLabel(kmh: number): string {
  if (!Number.isFinite(kmh) || kmh <= 0) return ''
  const sec = Math.round(3600 / kmh)
  const minutes = Math.floor(sec / 60)
  return `${minutes}:${String(sec % 60).padStart(2, '0')}`
}

function formatSlope(slope: number): string {
  const shown = Math.abs(slope) >= 10 ? Math.abs(slope).toFixed(0) : Math.abs(slope).toFixed(1)
  return `${slope > 0 ? '+' : '−'}${shown} bpm per km/h`
}

function formatTimeTick(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds)}s`
}

function PaceTip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as PaceRow | undefined
  if (!active || !row) return null
  const now = row.median ?? row.medianThin
  const before = row.before ?? row.beforeThin
  if (now === null && before === null) return null
  let line = `At ${paceLabel(row.speed)}/km`
  if (now !== null) line += `: ${Math.round(now)} bpm${before !== null ? compared(now, before) : ''}`
  else if (before !== null) line += `: ${Math.round(before)} bpm before`
  return (
    <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-white">{line}.</p>
      <p className="mt-1 text-white/45">{row.samples.toLocaleString('en-GB')} samples now · {row.beforeSamples.toLocaleString('en-GB')} before</p>
    </div>
  )
}

function compared(now: number, before: number): string {
  const diff = Math.round(now) - Math.round(before)
  if (diff === 0) return ', same as before'
  return `, ${Math.abs(diff)} ${diff < 0 ? 'lower' : 'higher'} than before`
}

function HrTip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as { hr?: number; seconds?: number } | undefined
  if (!active || !row || row.hr === undefined || !row.seconds) return null
  return (
    <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
      <p className="text-white/45">{row.hr}–{row.hr + 2} bpm</p>
      <p className="mt-1 font-medium text-white">{formatDuration(row.seconds)}</p>
    </div>
  )
}
