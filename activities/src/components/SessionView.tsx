import { useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { formatDistance, formatDuration, formatPaceOrSpeed } from '../lib/format'
import { DEFAULT_ZONES, INTENSITY_COLOR, intensityFromHeartRate, type ZoneEdges } from '../lib/intensity'
import { deriveSamples, distanceSplits, formatPace, median, smooth, type DistanceSplit } from '../lib/series'
import type { Activity } from '../types'
import { CURSOR, GRID, SERIES, TICK } from './chartChrome'

type Axis = 'time' | 'distance'

type StreamRow = {
  x: number
  alt: number | null
  pace: number | null
  gap: number | null
  hr: number | null
}

export function SessionView({
  activity,
  onBack,
  backLabel = '← Back to activities',
  maxHr = null,
  split = DEFAULT_ZONES,
}: {
  activity: Activity
  onBack: () => void
  backLabel?: string
  maxHr?: number | null
  split?: ZoneEdges
}) {
  const stream = activity.stream ?? []
  const samples = useMemo(() => deriveSamples(stream), [stream])
  const pace = useMemo(() => smooth(samples, (sample) => sample.pace), [samples])
  const gap = useMemo(() => smooth(samples, (sample) => sample.gap), [samples])
  const [axis, setAxis] = useState<Axis>('time')
  const [splitM, setSplitM] = useState(1000)
  const [hover, setHover] = useState<number | null>(null)
  const heart = samples.map((sample) => sample.hr).filter((value): value is number => value !== null)
  const splits = useMemo(() => distanceSplits(samples, splitM), [samples, splitM])
  const rows = useMemo<StreamRow[]>(
    () =>
      samples.map((sample, index) => ({
        x: axis === 'time' ? sample.t : sample.d,
        alt: sample.alt,
        pace: pace[index] ?? null,
        gap: gap[index] ?? null,
        hr: sample.hr,
      })),
    [samples, pace, gap, axis],
  )
  const current = hover === null ? null : samples[hover]
  const when = new Date(activity.date)

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-white/60 hover:text-white">
        {backLabel}
      </button>
      <header>
        <h1 className="font-display text-2xl font-semibold">{activity.name}</h1>
        <p className="mt-1 text-sm text-white/55">
          {activity.type} · {formatDistance(activity.distanceM)} ·{' '}
          {Number.isNaN(when.getTime())
            ? activity.date
            : when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </header>

      {samples.length < 2 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/60">
          This session has no pace or heart-rate stream yet. Drop the Strava zip again so the FIT file can be read.
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-display text-sm font-semibold">The session</h2>
              <div className="flex rounded-md bg-white/5 p-0.5" role="group" aria-label="Chart axis">
                {(['time', 'distance'] as Axis[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setAxis(item)}
                    className={`rounded px-2.5 py-1 text-xs capitalize ${axis === item ? 'bg-sky-400/20 text-sky-100' : 'text-white/55'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <dl className="mb-4 grid grid-cols-3 gap-x-4 gap-y-3 border-y border-white/10 py-3">
              <Stat swatch={SERIES.pace} label="Avg pace" value={formatPaceOrSpeed(activity)} />
              <Stat swatch={SERIES.hr} label="Median HR" value={heart.length ? `${Math.round(median(heart) ?? 0)} bpm` : '—'} />
              <Stat swatch={SERIES.profile} label="Elevation gain" value={`${Math.round(activity.elevationM)} m`} />
            </dl>

            <div className="space-y-1" onMouseLeave={() => setHover(null)}>
              <StreamLayer
                rows={rows}
                axis={axis}
                title="Profile"
                detail="altitude, m"
                color={SERIES.profile}
                dataKey="alt"
                height={96}
                fill
                showAxis={false}
                onHover={setHover}
              />
              <StreamLayer
                rows={rows}
                axis={axis}
                title="Pace"
                detail="min/km, 30 s smoothed"
                color={SERIES.pace}
                dataKey="pace"
                extra={{ key: 'gap', color: SERIES.gap, title: 'Grade-adjusted pace', detail: 'min/km, 30 s smoothed' }}
                height={148}
                reversed
                formatTick={formatPace}
                showAxis={false}
                onHover={setHover}
              />
              <StreamLayer
                rows={rows}
                axis={axis}
                title="Heart rate"
                detail="bpm"
                color={SERIES.hr}
                dataKey="hr"
                height={112}
                fill
                showAxis
                onHover={setHover}
              />
            </div>
            <p className="mt-2 flex items-baseline justify-between gap-3 text-xs">
              <span className="text-white/70">
                {current ? (
                  <>
                    {formatDuration(current.t)} · {formatDistance(current.d)} · {current.alt === null ? '—' : `${Math.round(current.alt)} m`} · pace{' '}
                    {formatPace(pace[hover ?? 0])} · GAP {formatPace(gap[hover ?? 0])} · {current.hr === null ? '—' : `${Math.round(current.hr)} bpm`}
                    {current.cad === null ? '' : ` · ${Math.round(current.cad)} spm`}
                  </>
                ) : (
                  <span className="text-white/40">Move across the charts to read altitude, pace and heart rate together.</span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-white/35">{axis === 'time' ? 'time (h:mm)' : 'distance (km)'}</span>
            </p>
          </section>

          <PaceBySplit splitM={splitM} onSplit={setSplitM} splits={splits} distanceM={activity.distanceM} maxHr={maxHr} split={split} />
        </>
      )}
    </div>
  )
}

function Stat({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-[11px] text-white/45">
        <span className="h-0.5 w-3.5 rounded-full" style={{ background: swatch }} />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function SeriesLabel({ color, title, detail }: { color: string; title: string; detail: string }) {
  return (
    <p className="flex items-center gap-2 text-[11px] text-white/75">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      <span>{title}</span>
      <span className="text-white/35">{detail}</span>
    </p>
  )
}

function hoverIndex(index: number | string | null | undefined, length: number): number | null {
  if (index == null || index === '') return null
  const parsed = typeof index === 'number' ? index : Number(index)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= length) return null
  return parsed
}

function StreamLayer({
  rows,
  axis,
  title,
  detail,
  color,
  dataKey,
  extra,
  height,
  fill,
  reversed,
  formatTick,
  showAxis,
  onHover,
}: {
  rows: StreamRow[]
  axis: Axis
  title: string
  detail: string
  color: string
  dataKey: keyof StreamRow
  extra?: { key: keyof StreamRow; color: string; title: string; detail: string }
  height: number
  fill?: boolean
  reversed?: boolean
  formatTick?: (value: number) => string
  showAxis: boolean
  onHover: (index: number | null) => void
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1">
        <SeriesLabel color={color} title={title} detail={detail} />
        {extra ? <SeriesLabel color={extra.color} title={extra.title} detail={extra.detail} /> : null}
      </div>
      <div className="rounded-md bg-black/25" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            syncId="session"
            syncMethod="index"
            margin={{ top: 8, right: 8, left: 0, bottom: showAxis ? 4 : 0 }}
            onMouseMove={(state) => onHover(hoverIndex(state.activeTooltipIndex, rows.length))}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              hide={!showAxis}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => (axis === 'time' ? formatClock(value) : formatAxisKm(value))}
              minTickGap={28}
            />
            <YAxis
              width={46}
              reversed={reversed}
              domain={['auto', 'auto']}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => (formatTick ? formatTick(value) : `${Math.round(value)}`)}
              allowDecimals={false}
            />
            <Tooltip content={() => null} cursor={CURSOR} />
            {fill ? (
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke="none"
                fill={color}
                fillOpacity={0.16}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.6}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            {extra ? (
              <Line
                type="monotone"
                dataKey={extra.key}
                stroke={extra.color}
                strokeWidth={1.6}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

function formatAxisKm(meters: number): string {
  const km = meters / 1000
  if (km < 10) return km.toFixed(1)
  return `${Math.round(km)}`
}

const SPLITS = [1000, 5000] as const

function PaceBySplit({
  splits,
  splitM,
  onSplit,
  distanceM,
  maxHr,
  split,
}: {
  splits: DistanceSplit[]
  splitM: number
  onSplit: (meters: number) => void
  distanceM: number
  maxHr: number | null
  split: ZoneEdges
}) {
  const choices = SPLITS.filter((meters) => meters === 1000 || distanceM >= meters * 2)
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold">Pace by split</h2>
          <p className="mt-1 text-xs text-white/45">
            Clock pace for each {splitM === 1000 ? 'kilometre' : '5 km'}, colored by heart-rate zone.
          </p>
        </div>
        {choices.length > 1 ? (
          <div className="flex rounded-md bg-white/5 p-0.5" role="group" aria-label="Split length">
            {choices.map((meters) => (
              <button
                key={meters}
                type="button"
                onClick={() => onSplit(meters)}
                className={`rounded px-2.5 py-1 text-xs ${splitM === meters ? 'bg-sky-400/20 text-sky-100' : 'text-white/55'}`}
              >
                {meters === 1000 ? '1 km' : '5 km'}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {splits.length === 0 ? (
        <p className="mt-4 text-sm text-white/45">Not enough distance to build a split.</p>
      ) : (
        <SplitBars splits={splits} maxHr={maxHr} split={split} />
      )}
    </section>
  )
}

function splitColor(hr: number | null, maxHr: number | null, split: ZoneEdges): string {
  if (hr === null) return '#64748b'
  const level = intensityFromHeartRate(hr, maxHr, split)
  return level ? INTENSITY_COLOR[level] : '#64748b'
}

function SplitBars({ splits, maxHr, split }: { splits: DistanceSplit[]; maxHr: number | null; split: ZoneEdges }) {
  const paces = splits.map((split) => split.pace)
  const min = Math.min(...paces)
  const max = Math.max(...paces)
  const pad = Math.max(6, (max - min) * 0.6)
  return (
    <div className="mt-3 rounded-md bg-black/25" style={{ height: Math.max(168, splits.length * 32) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={splits} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            domain={[Math.max(120, min - pad), max + pad]}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatPace(value)}
          />
          <YAxis type="category" dataKey="label" width={36} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip content={SplitTip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="pace" radius={[0, 3, 3, 0]} isAnimationActive={false} maxBarSize={18}>
            {splits.map((item) => (
              <Cell key={item.label} fill={splitColor(item.hr, maxHr, split)} fillOpacity={item.partial ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SplitTip({ active, payload }: TooltipContentProps) {
  const split = payload?.[0]?.payload as DistanceSplit | undefined
  if (!active || !split) return null
  return (
    <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
      <p className="text-white/45">
        {split.label} km{split.partial ? ' · partial' : ''}
      </p>
      <p className="mt-1 font-medium text-white">
        {formatPace(split.pace)} /km{split.hr === null ? '' : ` · ${Math.round(split.hr)} bpm`}
      </p>
    </div>
  )
}
