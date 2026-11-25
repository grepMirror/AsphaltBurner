import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { GRID, TICK } from '../components/chartChrome'
import { ChartFrame } from '../components/ChartFrame'
import { ChartNote } from '../components/ChartNote'
import { Segment } from '../components/Segment'
import { formatWhen } from '../lib/format'
import {
  CLASS_LABEL,
  buildSpeedProfile,
  curveRows,
  distanceLabel,
  strongestRecord,
  type CriticalFit,
  type CurveRow,
  type DistanceClass,
  type DistanceRecord,
  type DurationEffort,
} from '../lib/speed'
import type { Activity } from '../types'

type Front = 'records' | 'efforts'

const CLASS_ORDER: DistanceClass[] = ['short', 'intermediate', 'long', 'veryLong']
const CLASS_COLOR: Record<DistanceClass, string> = {
  short: '#fb7185',
  intermediate: '#f9a8d4',
  long: '#fda4af',
  veryLong: '#d6d3d1',
}
const CURVE = '#7dd3fc'
const FAST = '#15803d'
const SLOW = '#9f1239'
const AMBER = '#fbbf24'
const EFFORT = '#e0a045'

const STREAM_LIMIT = 'Best efforts are read from run streams only. A session keeps at most 360 points. A gap over 3 minutes breaks the effort, and so does a speed above 47.7 km/h (Usain Bolt’s top speed + 3 km/h); the two sides are never joined. Stops stay in the effort, so their time counts. One unbroken piece can count for 5 km within 100 m, or for 10 km and longer within 200 m, at the pace that piece was actually run. 1 km stays exact. A pace faster than 2:20/km or slower than 15:00/km is dropped. Heart rate outside 40–230 bpm is ignored, and a missing heart rate is not stored as zero.'

export function SpeedProfile({ ready, activities }: { ready: boolean; activities: Activity[] }) {
  const model = useMemo(() => (ready ? buildSpeedProfile(activities) : null), [ready, activities])
  const [front, setFront] = useState<Front>('records')
  const [picked, setPicked] = useState<number | null>(null)
  const chosen = model?.records.find((record) => record.meters === picked)
  const five = model?.records.find((record) => record.meters === 5000)
  const anchor = chosen ?? five ?? (model ? strongestRecord(model.records) : null)
  const rows = useMemo(() => (model && anchor ? curveRows(model.records, anchor) : []), [model, anchor])
  if (!model) return <p className="py-10 text-sm text-white/55">Loading saved sessions…</p>

  const recordsCard = (compact = false) => (
    <RecordsCard records={model.records} rows={rows} anchor={anchor} critical={model.critical} compact={compact} onPick={compact ? undefined : setPicked} />
  )
  const effortsCard = (compact = false) => <EffortsCard efforts={model.efforts} critical={model.critical} now={model.now} compact={compact} />

  return (
    <div className="grid items-start gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">{front === 'records' ? recordsCard() : effortsCard()}</div>
      <div className="relative min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/30">
        <button
          type="button"
          onClick={() => setFront((current) => (current === 'records' ? 'efforts' : 'records'))}
          aria-label={front === 'records' ? 'Show speed by effort duration as the main chart' : 'Show record coherence as the main chart'}
          className="absolute inset-0 z-0 rounded-xl"
        />
        <div className="pointer-events-none relative z-10">{front === 'records' ? effortsCard(true) : recordsCard(true)}</div>
      </div>
    </div>
  )
}

function RecordsCard({
  records,
  rows,
  anchor,
  critical,
  compact,
  onPick,
}: {
  records: DistanceRecord[]
  rows: CurveRow[]
  anchor: DistanceRecord | null
  critical: CriticalFit | null
  compact: boolean
  onPick?: (meters: number) => void
}) {
  const counts = { short: 0, intermediate: 0, long: 0, veryLong: 0 }
  for (const record of records) counts[record.klass] += 1
  const yDomain = paceDomain(rows)
  const xDomain = meterDomain(rows)

  return (
    <section className={compact ? '' : 'rounded-xl border border-white/10 bg-white/[0.03] p-4'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>How coherent are your records</h2>
          <p className={`${compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'} text-white/70`}>
            {critical ? `Critical speed = ${formatPace(critical.pace)}/km` : 'Critical speed not estimated'}
          </p>
        </div>
        <ChartNote label="How record coherence is built" align="right">
          <Note title="How the chart is built" points={[
            'One of your records anchors the chart; the blue curve is what it implies at every other distance through Riegel’s formula, T₂ = T₁ × (D₂/D₁)^1.06.',
            'The envelope around the curve bounds that prediction between exponents 1.04 (speed profile) and 1.08 (endurance profile).',
            'The anchor defaults to 5 km, or to your strongest record at equalised distance when you have no 5 km. You can change it, and the curve follows.',
            'The curve stops at the distances you actually raced: it predicts nothing beyond them.',
            'Distances checked: 1 km, 5 km, 10 km, 15 km, 21.1 km, 42.2 km. One you never covered is left off.',
            STREAM_LIMIT,
          ]} />
          <Note title="How to read it" points={[
            'A point on the curve: that record matches the anchor’s level.',
            'A point above: slower than the anchor implied. Below: stronger.',
            'An amber point falls outside the envelope: that is where your records contradict each other most.',
          ]} />
          <Note title="Limits" points={[
            'Riegel’s exponent is an empirical constant, not a fit on you. A point outside the envelope does not say a record is wrong: it says this distance and the anchor do not describe the same runner.',
            'Riegel is an empirical rule, roughly valid from 1,500 m to marathon, and assumes training suited to each distance.',
            'An old record is still plotted: its gap may describe your past, not your current form.',
            'A record set in training and one set in a race are not comparable; the chart does not tell them apart.',
          ]} />
        </ChartNote>
      </div>
      {!compact && anchor ? (
        <p className="mt-1 text-xs text-white/45">
          Your records placed on the curve one of them implies · {anchor.label} anchor · {records.length} {records.length === 1 ? 'record' : 'records'}
        </p>
      ) : null}
      {!compact && onPick && records.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/45">Anchor</span>
          <Segment
            label="Anchor"
            value={String(anchor?.meters ?? records[0].meters)}
            options={records.map((record) => ({ id: String(record.meters), label: record.label }))}
            onChange={(id) => onPick(Number(id))}
          />
        </div>
      ) : null}
      {records.length === 0 ? <p className="mt-6 text-sm text-[#9AA3B5]">No distance records yet. A run needs a stream that covers 1 km without a gap over 3 minutes.</p> : null}
      {rows.length > 0 && anchor && compact ? (
        <div className="mt-2 h-36">
          <RecordsChart rows={rows} yDomain={yDomain} xDomain={xDomain} />
        </div>
      ) : null}
      {rows.length > 0 && anchor && !compact ? (
        <ChartFrame label="How coherent are your records">
          {(full) => (
            <div className={full ? 'h-full' : 'mt-4 h-[260px] sm:h-[360px]'}>
              <RecordsChart rows={rows} yDomain={yDomain} xDomain={xDomain} anchorLabel={anchor.label} tip />
            </div>
          )}
        </ChartFrame>
      ) : null}
      {!compact && anchor && records.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#9AA3B5]">
            <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-[#7dd3fc]" />Curve implied by the {anchor.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-8 rounded-sm bg-gradient-to-r from-[#15803d] to-[#9f1239]" />
              1.04–1.08 envelope
            </span>
            <span>faster than predicted</span>
            <span>slower</span>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AMBER }} />Outside</span>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-white" />Anchor</span>
            {CLASS_ORDER.map((klass) => (
              <span key={klass} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[klass] }} />
                {CLASS_LABEL[klass]} {counts[klass] || '—'}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/40">
            Above the curve is slower than the anchor. The curve stops at the distances you raced.
            {records.length < 2 ? ' One distance so far, so there is no curve yet.' : ''}
          </p>
        </>
      ) : null}
    </section>
  )
}

function RecordsChart({
  rows,
  yDomain,
  xDomain,
  anchorLabel,
  tip = false,
}: {
  rows: CurveRow[]
  yDomain: [number, number]
  xDomain: [number, number]
  anchorLabel?: string
  tip?: boolean
}) {
  const ticks = rows.flatMap((row) => (row.record ? [row.meters] : []))
  return (
    <div role="group" aria-label="How coherent are your records" className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: tip ? 16 : 4, right: tip ? 36 : 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="meters" type="number" domain={xDomain} ticks={ticks} allowDataOverflow tick={TICK} tickLine={false} axisLine={false} minTickGap={8} tickFormatter={(value: number) => distanceLabel(value)} padding={{ right: 8 }} />
          <YAxis width={40} domain={yDomain} allowDataOverflow tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatPace(value)} />
          {tip && anchorLabel ? <Tooltip content={(props) => <RecordTip {...props} anchorLabel={anchorLabel} />} cursor={{ stroke: 'rgba(255,255,255,0.35)' }} /> : null}
          <Area dataKey="low" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" tooltipType="none" />
          <Area dataKey="fastGap" stackId="band" stroke="none" fill={FAST} fillOpacity={0.55} isAnimationActive={false} legendType="none" tooltipType="none" />
          <Area dataKey="slowGap" stackId="band" stroke="none" fill={SLOW} fillOpacity={0.45} isAnimationActive={false} legendType="none" tooltipType="none" />
          <Line dataKey="curve" type="linear" stroke={CURVE} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} legendType="none" />
          <Line dataKey="pace" stroke="none" strokeWidth={0} dot={RecordDot} activeDot={false} connectNulls={false} isAnimationActive={false} legendType="none" tooltipType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function EffortsCard({ efforts, critical, now, compact }: { efforts: DurationEffort[]; critical: CriticalFit | null; now: number; compact: boolean }) {
  const shapes = new Set(efforts.map((effort) => effort.fresh))
  const yDomain = effortPaceDomain(efforts, critical)
  const xDomain = logDomain(efforts)
  const criticalHigh = critical ? critical.pace < (yDomain[0] + yDomain[1]) / 2 : false

  return (
    <section className={compact ? '' : 'rounded-xl border border-white/10 bg-white/[0.03] p-4'}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>Your speed by effort duration</h2>
        <ChartNote label="How speed by duration is built" align="right">
          <Note title="How the chart is built" points={[
            'Each point is a best effort actually run over that duration, computed from your activities. Every published step is shown; the count is never assumed.',
            'Steps: 30 s, 1 min, 2 min, 3 min, 5 min, 10 min, 20 min, 30 min, 45 min, 1 h, 1 h 30, 2 h, 2 h 30.',
            'The duration axis is logarithmic, so 30 s and 2 h 30 keep their real spacing instead of being spread evenly.',
            'Critical speed is the asymptote of the distance = D′ + critical speed × time fit, on best efforts from 2 min to 20 min, over at least three of those steps and with R² ≥ 0.98.',
            STREAM_LIMIT,
          ]} />
          <Note title="How to read it" points={[
            'The solid line joins the observed best efforts; the grey horizontal line is the estimated critical speed, a computed value rather than a measured one.',
            'Point shape carries freshness: filled circle for an effort 90 days old or less, diamond for an older one, square when the date is missing.',
            'A long best effort may sit below the estimated critical speed. The model is calibrated on short efforts and says nothing about that range.',
          ]} />
          <Note title="Limits" points={[
            'This is an observational read of your history, not a controlled test nor a physiological threshold measurement.',
            'Steps come from different dates, terrains, weather, fatigue states and sensors; none of it is corrected for.',
            'The heart rate shown is the one recorded during that best effort, not your usual heart rate at that pace. A step without heart rate leaves a gap and is never counted as zero.',
          ]} />
        </ChartNote>
      </div>
      {!compact ? (
        <p className="mt-1 text-xs text-white/45">
          {critical ? `Critical speed = ${formatPace(critical.pace)}/km` : 'Critical speed not estimated'}
          {' · '}
          {efforts.length} best {efforts.length === 1 ? 'effort' : 'efforts'}
        </p>
      ) : null}
      {efforts.length === 0 ? <p className="mt-6 text-sm text-[#9AA3B5]">No timed best efforts yet. A run needs a stream that covers 30 seconds.</p> : null}
      {efforts.length > 0 && compact ? (
        <div className="mt-2 h-36">
          <EffortsChart efforts={efforts} critical={critical} yDomain={yDomain} xDomain={xDomain} criticalHigh={criticalHigh} now={now} />
        </div>
      ) : null}
      {efforts.length > 0 && !compact ? (
        <ChartFrame label="Your speed by effort duration">
          {(full) => (
            <div className={full ? 'h-full' : 'mt-4 h-[260px] sm:h-[360px]'}>
              <EffortsChart efforts={efforts} critical={critical} yDomain={yDomain} xDomain={xDomain} criticalHigh={criticalHigh} now={now} tip />
            </div>
          )}
        </ChartFrame>
      ) : null}
      {!compact && efforts.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#9AA3B5]">
            <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-[#e0a045]" />Best efforts</span>
            {shapes.has('recent') ? <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#e0a045]" />90 days or less</span> : null}
            {shapes.has('old') ? <span className="flex items-center gap-2"><span className="inline-block h-2 w-2 rotate-45 bg-[#e0a045]" />Older than 90 days</span> : null}
            {shapes.has('missing') ? <span className="flex items-center gap-2"><span className="h-2 w-2 bg-[#e0a045]" />Date missing</span> : null}
            {critical ? <span className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-white/50" />Estimated critical speed</span> : null}
            <span className="ml-auto">Pace · min/km</span>
          </div>
          <p className="mt-2 text-xs text-white/40">
            {critical
              ? 'The grey line is estimated from efforts between 2 min and 20 min, not a measured effort. A longer effort can sit below it.'
              : 'Critical speed stays off until at least three efforts from 2 min to 20 min fit with R² ≥ 0.98.'}
          </p>
        </>
      ) : null}
    </section>
  )
}

function EffortsChart({
  efforts,
  critical,
  yDomain,
  xDomain,
  criticalHigh,
  now,
  tip = false,
}: {
  efforts: DurationEffort[]
  critical: CriticalFit | null
  yDomain: [number, number]
  xDomain: [number, number]
  criticalHigh: boolean
  now: number
  tip?: boolean
}) {
  return (
    <div role="group" aria-label="Your speed by effort duration" className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={efforts} margin={{ top: tip ? 16 : 8, right: tip ? 28 : 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="seconds" type="number" scale="log" domain={xDomain} ticks={efforts.map((effort) => effort.seconds)} allowDataOverflow tick={TICK} tickLine={false} axisLine={false} minTickGap={8} tickFormatter={(value: number) => efforts.find((effort) => effort.seconds === value)?.label ?? ''} />
          <YAxis reversed width={42} domain={yDomain} allowDataOverflow tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatPace(value)} />
          {tip ? <Tooltip content={(props) => <EffortTip {...props} now={now} />} cursor={{ stroke: 'rgba(255,255,255,0.35)' }} /> : null}
          {critical ? (
            <ReferenceLine
              y={critical.pace}
              stroke="rgba(231,237,245,0.45)"
              strokeDasharray="3 4"
              ifOverflow="extendDomain"
              label={tip ? { value: 'estimated critical speed', position: criticalHigh ? 'insideBottomLeft' : 'insideTopLeft', fill: 'rgba(231,237,245,0.55)', fontSize: 11 } : undefined}
            />
          ) : null}
          <Line dataKey="pace" type="linear" stroke={EFFORT} strokeWidth={2} dot={EffortDot} activeDot={false} isAnimationActive={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function Note({ title, points }: { title: string; points: string[] }) {
  return (
    <>
      <p className="mb-1 mt-3 font-medium text-white/85 first:mt-0">{title}</p>
      <ul className="space-y-1.5">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </>
  )
}

type DotProps = { cx?: number; cy?: number; payload?: CurveRow }

function RecordDot({ cx, cy, payload }: DotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload?.record) return <g />
  if (payload.record.anchor) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="#05060a" stroke="#fff" strokeWidth={1.75} />
        <circle cx={cx} cy={cy} r={2.2} fill="none" stroke="#fff" strokeWidth={1} />
      </g>
    )
  }
  const fill = payload.record.outside ? AMBER : CLASS_COLOR[payload.record.klass]
  return <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke="#05060a" strokeWidth={1} />
}

function EffortDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: DurationEffort }) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return <g />
  if (payload.fresh === 'missing') return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={EFFORT} stroke="#05060a" strokeWidth={1} />
  if (payload.fresh === 'old') return <polygon points={`${cx},${cy - 5} ${cx + 4.5},${cy} ${cx},${cy + 5} ${cx - 4.5},${cy}`} fill={EFFORT} stroke="#05060a" strokeWidth={1} />
  return <circle cx={cx} cy={cy} r={4} fill={EFFORT} stroke="#05060a" strokeWidth={1} />
}

function RecordTip({ active, payload, anchorLabel }: TooltipContentProps & { anchorLabel: string }) {
  const row = payload?.[0]?.payload as CurveRow | undefined
  if (!active || !row) return null
  const record = row.record
  if (!record) {
    const high = row.low + row.fastGap + row.slowGap
    return (
      <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
        <p className="font-medium text-white">At {distanceLabel(row.meters)} the {anchorLabel} implies {formatPace(row.curve)}/km.</p>
        <p className="mt-1 text-white/45">Envelope {formatPace(row.low)}–{formatPace(high)}/km</p>
      </div>
    )
  }
  const delta = Math.round(record.pace) - Math.round(record.implied)
  let read = 'Matches the anchor’s level.'
  if (record.anchor) read = 'This record draws the curve.'
  else if (delta > 0) read = `${delta} s/km slower than the ${anchorLabel} implies.`
  else if (delta < 0) read = `${Math.abs(delta)} s/km faster than the ${anchorLabel} implies.`
  return (
    <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-white">{record.label} · {formatClock(record.seconds)} · {formatPace(record.pace)}/km</p>
      <p className="mt-1 text-white/80">{read}</p>
      <p className="mt-1 text-white/45">{record.outside ? 'Outside the envelope' : 'Inside the envelope'}</p>
      <p className="text-white/45">{record.date ? formatWhen(record.date) : 'Date missing'} · {record.hr === null ? 'No heart rate' : `${record.hr} bpm`}</p>
    </div>
  )
}

function EffortTip({ active, payload, now }: TooltipContentProps & { now: number }) {
  const row = payload?.[0]?.payload as DurationEffort | undefined
  if (!active || !row || row.pace === undefined) return null
  return (
    <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-white">{row.label} · {formatPace(row.pace)}/km</p>
      <p className="mt-1 text-white/45">{row.date ? `${formatWhen(row.date)} · ${ageLabel(row.date, now)}` : 'Date missing'}</p>
      <p className="text-white/45">{row.hr === null ? 'No heart rate' : `${row.hr} bpm`}</p>
    </div>
  )
}

function paceDomain(rows: CurveRow[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const row of rows) {
    lo = Math.min(lo, row.low, row.pace ?? Infinity)
    hi = Math.max(hi, row.low + row.fastGap + row.slowGap, row.pace ?? -Infinity)
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [180, 420]
  const pad = Math.max(8, (hi - lo) * 0.18)
  return [lo - pad, hi + pad]
}

function meterDomain(rows: CurveRow[]): [number, number] {
  if (rows.length === 0) return [0, 1]
  const first = rows[0].meters
  const last = rows[rows.length - 1].meters
  const span = Math.max(last - first, 1)
  return [first - span * 0.04, last + span * 0.14]
}

function effortPaceDomain(efforts: DurationEffort[], critical: CriticalFit | null): [number, number] {
  if (efforts.length === 0) return [180, 420]
  const values = efforts.map((effort) => effort.pace)
  if (critical) values.push(critical.pace)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(8, (hi - lo) * 0.18)
  return [Math.max(60, lo - pad), hi + pad]
}

function logDomain(efforts: DurationEffort[]): [number, number] {
  if (efforts.length === 0) return [30, 3600]
  const lo = efforts[0].seconds
  const hi = efforts[efforts.length - 1].seconds
  if (hi === lo) return [lo / 2, lo * 2]
  return [lo / 1.6, hi * 1.9]
}

function formatPace(secPerKm: number): string {
  const sec = Math.round(secPerKm)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function ageLabel(date: string, now: number): string {
  const days = Math.floor((now - Date.parse(date)) / 86400000)
  if (!Number.isFinite(days) || days < 0) return formatWhen(date)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}
