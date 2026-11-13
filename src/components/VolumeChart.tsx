import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Activity, DateWindow, MetricId, RangeId, Sport } from '../types'
import { SportIcon } from './SportIcon'
import { formatDistance, formatHours, SPORT_COLOR, SPORT_LABEL } from '../lib/format'
import { activeWeeks, buildBuckets, formatWindow, grainFor, periodBounds, windowBounds } from '../lib/period'
import { GRID, TICK } from './chartChrome'

const RANGES: { id: Exclude<RangeId, 'custom'>; label: string }[] = [
  { id: '4w', label: '4 wk' },
  { id: '12w', label: '12 wk' },
  { id: '12m', label: '12 mo' },
  { id: 'all', label: 'All' },
]

const METRICS: { id: MetricId; label: string }[] = [
  { id: 'km', label: 'km' },
  { id: 'h', label: 'h' },
  { id: 'sessions', label: 'sessions' },
  { id: 'elev', label: 'elev' },
]

const STACK: Sport[] = ['run', 'swim', 'ride', 'other']

type VolumeRow = {
  label: string
  start: number
  end: number
  run: number
  swim: number
  ride: number
  other: number
  km: number
  hours: number
  sessions: number
}

function formatTotal(metric: MetricId, value: number): string {
  if (metric === 'sessions') return `${Math.round(value)}`
  if (metric === 'elev') return `${Math.round(value)}`
  if (value < 10) return value.toFixed(1)
  return `${Math.round(value)}`
}

export function VolumeChart({
  activities,
  range,
  custom,
  metric,
  focus,
  highlightTime,
  onRange,
  onCustom,
  onMetric,
  onClearFocus,
}: {
  activities: Activity[]
  range: RangeId
  custom: DateWindow | null
  metric: MetricId
  focus: DateWindow | null
  highlightTime: number | null
  onRange: (range: Exclude<RangeId, 'custom'>) => void
  onCustom: (window: DateWindow) => void
  onMetric: (metric: MetricId) => void
  onClearFocus: () => void
}) {
  const bounds = focus ? windowBounds(focus) : periodBounds(range, new Date(), custom)
  const grain = focus ? 'day' : grainFor(range, bounds)
  const buckets = buildBuckets(activities, bounds, metric, grain)
  const weeks = activeWeeks(activities, bounds)
  const visible = activities.filter((activity) => {
    const time = new Date(activity.date).getTime()
    return time >= bounds.start && time <= bounds.end
  })
  const distanceKm = visible.reduce((sum, activity) => sum + activity.distanceM, 0) / 1000
  const hours = visible.reduce((sum, activity) => sum + activity.movingSec, 0) / 3600
  const rows: VolumeRow[] = buckets.map((bucket) => ({
    label: bucket.label,
    start: bucket.start,
    end: bucket.end,
    run: bucket.values.run,
    swim: bucket.values.swim,
    ride: bucket.values.ride,
    other: bucket.values.other,
    km: bucket.km,
    hours: bucket.hours,
    sessions: bucket.sessions,
  }))
  const [datesOpen, setDatesOpen] = useState(false)
  const [draftStart, setDraftStart] = useState(custom?.start ?? focus?.start ?? '')
  const [draftEnd, setDraftEnd] = useState(custom?.end ?? focus?.end ?? '')
  const [hover, setHover] = useState<number | null>(null)

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 font-display text-xs font-semibold tracking-[0.16em] text-white/70">VOLUME</h2>
        <div className="flex rounded-md bg-white/5 p-0.5">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRange(item.id)}
              className={`rounded px-2.5 py-1 text-xs ${range === item.id ? 'bg-white/15 text-white' : 'text-white/55'}`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setDraftStart(custom?.start ?? focus?.start ?? draftStart)
              setDraftEnd(custom?.end ?? focus?.end ?? draftEnd)
              setDatesOpen((open) => !open)
            }}
            className={`rounded px-2.5 py-1 text-xs ${!focus && range === 'custom' ? 'bg-white/15 text-white' : 'text-white/55'}`}
          >
            {!focus && range === 'custom' && custom ? formatWindow(custom) : 'Dates'}
          </button>
        </div>
        <div className="flex rounded-md bg-white/5 p-0.5">
          {METRICS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onMetric(item.id)}
              className={`rounded px-2.5 py-1 text-xs ${metric === item.id ? 'bg-sky-400/20 text-sky-200' : 'text-white/55'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {datesOpen ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-black/40 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draftStart || !draftEnd) return
            onCustom({ start: draftStart, end: draftEnd })
            setDatesOpen(false)
          }}
        >
          <label className="text-xs text-white/55">
            From
            <input
              required
              type="date"
              value={draftStart}
              onChange={(event) => setDraftStart(event.target.value)}
              className="mt-1 block rounded-md border border-white/15 bg-black px-2 py-1 text-sm text-white [color-scheme:dark]"
            />
          </label>
          <label className="text-xs text-white/55">
            To
            <input
              required
              type="date"
              value={draftEnd}
              onChange={(event) => setDraftEnd(event.target.value)}
              className="mt-1 block rounded-md border border-white/15 bg-black px-2 py-1 text-sm text-white [color-scheme:dark]"
            />
          </label>
          <button type="submit" className="rounded-md bg-sky-400 px-3 py-1.5 text-sm font-medium text-slate-950">
            Apply
          </button>
        </form>
      ) : null}

      <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>
          <strong className="text-lg font-semibold tabular-nums">{distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)}</strong> km
        </span>
        <span>
          <strong className="text-lg font-semibold tabular-nums">{visible.length}</strong> {visible.length === 1 ? 'session' : 'sessions'}
        </span>
        <span>
          <strong className="text-lg font-semibold tabular-nums">{hours < 10 ? hours.toFixed(1) : Math.round(hours)}</strong> h
        </span>
        <span className="text-white/70">
          <strong className="text-lg font-semibold tabular-nums text-white">{weeks.active}</strong>/{weeks.total} active wk
        </span>
        {focus ? (
          <button type="button" onClick={onClearFocus} className="text-xs text-sky-300">
            Week of {formatWindow(focus)} · show full period
          </button>
        ) : null}
      </p>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/55">
        {STACK.map((sport) => (
          <span key={sport} className="flex items-center gap-1.5">
            <SportIcon sport={sport} className="h-3.5 w-3.5" />
            <span className="h-2 w-2 rounded-sm" style={{ background: SPORT_COLOR[sport] }} />
            {SPORT_LABEL[sport]}
          </span>
        ))}
      </div>

      <div className="mt-2 h-48 rounded-md bg-black/25" onMouseLeave={() => setHover(null)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
            onMouseMove={(state) => {
              const raw = state.activeTooltipIndex
              if (raw == null || raw === '') {
                setHover(null)
                return
              }
              const index = typeof raw === 'number' ? raw : Number(raw)
              setHover(Number.isInteger(index) ? index : null)
            }}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval={rows.length > 16 ? 1 : 0} />
            <YAxis width={36} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatTotal(metric, value)} allowDecimals={false} />
            <Tooltip content={(props) => <VolumeTip active={props.active} row={props.payload?.[0]?.payload as VolumeRow | undefined} metric={metric} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {STACK.map((sport) => (
              <Bar key={sport} dataKey={sport} stackId="volume" fill={SPORT_COLOR[sport]} isAnimationActive={false} maxBarSize={28}>
                {rows.map((row, index) => {
                  const active = highlightTime !== null && highlightTime >= row.start && highlightTime < row.end
                  const dim = hover !== null && hover !== index
                  return <Cell key={row.start} fillOpacity={dim ? 0.35 : 1} stroke={active ? 'rgba(125,211,252,0.95)' : 'none'} strokeWidth={active ? 1 : 0} />
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function VolumeTip({ active, row, metric }: { active?: boolean; row?: VolumeRow; metric: MetricId }) {
  if (!active || !row) return null
  const total = row.run + row.swim + row.ride + row.other
  return (
    <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
      <p className="text-[11px] uppercase tracking-wide text-white/45">{row.label}</p>
      <p className="mt-1 font-medium text-white">
        {formatTotal(metric, total)} {metric === 'km' ? 'km' : metric === 'h' ? 'h' : metric === 'elev' ? 'm' : 'sessions'}
      </p>
      <p className="text-white/70">
        {formatDistance(row.km * 1000)} · {formatHours(row.hours * 3600)} · {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}
      </p>
    </div>
  )
}
