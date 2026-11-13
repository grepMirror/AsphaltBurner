import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { GRID, TICK } from '../components/chartChrome'
import { formatDuration } from '../lib/format'
import {
  buildLoadWeeks,
  loadWindowLabel,
  parseCustomDraft,
  periodZoneShares,
  suggestCustomWindow,
  ZONE_BANDS,
  type LoadMetric,
  type LoadRange,
  type ZoneStyle,
} from '../lib/load'
import { useActivities } from '../lib/activities'
import type { ZoneEdges } from '../lib/intensity'
import type { DateWindow } from '../types'

const RANGES: { id: LoadRange; label: string }[] = [
  { id: '4w', label: '4W' },
  { id: '8w', label: '8W' },
  { id: '12w', label: '12W' },
  { id: 'custom', label: 'Custom' },
]

const METRICS: { id: LoadMetric; label: string; unit: string }[] = [
  { id: 'volume', label: 'Volume', unit: 'km' },
  { id: 'hour', label: 'Hour', unit: 'h' },
  { id: 'elevation', label: 'Elevation', unit: 'm' },
]

export function LoadPage({ maxHr, split }: { maxHr: number; split: ZoneEdges }) {
  const { ready, activities } = useActivities()
  const [range, setRange] = useState<LoadRange>('8w')
  const [custom, setCustom] = useState<DateWindow | null>(null)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const [style, setStyle] = useState<ZoneStyle>('3')
  const [polarStyle, setPolarStyle] = useState<ZoneStyle>('3')
  const [metric, setMetric] = useState<LoadMetric>('volume')
  const [showLoad, setShowLoad] = useState(false)

  const windowLabel = loadWindowLabel(range, custom)
  const weeks = useMemo(() => buildLoadWeeks(activities, range, custom, metric, style, maxHr, split), [activities, range, custom, metric, style, maxHr, split])
  const shares = useMemo(() => periodZoneShares(activities, range, custom, polarStyle, maxHr, split), [activities, range, custom, polarStyle, maxHr, split])
  const rows = weeks.map((week) => ({ label: week.label, total: week.total, change: week.change, ...week.values }))
  const unit = METRICS.find((item) => item.id === metric)?.unit ?? ''
  const hasBars = weeks.some((week) => week.total > 0)

  const chooseRange = (next: LoadRange) => {
    if (next === 'custom') {
      const seed = custom ?? suggestCustomWindow()
      setDraftStart(seed.start)
      setDraftEnd(seed.end)
      setCustom(seed)
    }
    setRange(next)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-16 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Training load</h1>
            <p className="mt-1 text-sm text-white/55">{windowLabel}</p>
          </div>
          {ready ? (
            <div className="flex flex-col items-end gap-2">
              <Segment label="Date range" value={range} options={RANGES} onChange={chooseRange} />
              {range === 'custom' ? (
                <form
                  className="flex flex-wrap items-center justify-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const next = parseCustomDraft(draftStart, draftEnd)
                    if (next) setCustom(next)
                  }}
                >
                  <input type="date" required value={draftStart} onChange={(event) => setDraftStart(event.target.value)} className="rounded-md border border-white/15 bg-black px-2 py-1 text-xs text-white [color-scheme:dark]" />
                  <input type="date" required value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} className="rounded-md border border-white/15 bg-black px-2 py-1 text-xs text-white [color-scheme:dark]" />
                  <button type="submit" className="rounded-md bg-sky-400 px-2.5 py-1 text-xs font-medium text-slate-950">
                    Apply
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>

        {!ready ? <p className="text-sm text-white/55">Loading saved sessions…</p> : null}
        {ready && activities.length === 0 ? <p className="py-16 text-center text-sm text-white/55">No activity found</p> : null}

        {ready && activities.length > 0 ? <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Segment
              label="Zone style"
              value={style}
              options={[
                { id: '5', label: '5 zones' },
                { id: '3', label: '3 zones' },
              ]}
              onChange={setStyle}
            />
            <Segment
              label="Y axis"
              value={metric}
              options={METRICS.map((item) => ({ id: item.id, label: item.label }))}
              onChange={setMetric}
            />
            <button
              type="button"
              aria-pressed={showLoad}
              onClick={() => setShowLoad((current) => !current)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${showLoad ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5 text-white/55'}`}
            >
              <LoadMark />
              Week change
            </button>
          </div>

          {ready && !hasBars ? <p className="mt-8 text-sm text-[#9AA3B5]">No heart-rate data in this period, so the zones cannot be split.</p> : null}
          {hasBars ? (
            <>
              <div className="mt-4 h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ top: 12, right: showLoad ? 12 : 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis width={48} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatTick(metric, value)} />
                    {showLoad ? (
                      <YAxis yAxisId="change" orientation="right" width={42} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(value)}%`} />
                    ) : null}
                    <Tooltip content={(props) => <LoadTip {...props} metric={metric} showLoad={showLoad} style={style} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    {ZONE_BANDS[style].map((band, index) => (
                      <Bar
                        key={band.key}
                        dataKey={band.key}
                        stackId="zone"
                        fill={band.color}
                        isAnimationActive={false}
                        maxBarSize={42}
                        radius={index === ZONE_BANDS[style].length - 1 ? [4, 4, 0, 0] : undefined}
                      />
                    ))}
                    {showLoad ? (
                      <Line yAxisId="change" type="monotone" dataKey="change" stroke="#E8EAF0" strokeWidth={1.8} dot={{ r: 3, fill: '#E8EAF0' }} connectNulls={false} isAnimationActive={false} />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {ZONE_BANDS[style].map((band) => (
                  <span key={band.key} className="flex items-center gap-2 text-xs text-[#9AA3B5]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: band.color }} />
                    {band.label}
                  </span>
                ))}
                {showLoad ? (
                  <span className="flex items-center gap-2 text-xs text-[#9AA3B5]">
                    <span className="h-0.5 w-4 bg-[#E8EAF0]" />
                    Week change
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-[#9AA3B5]">Weeks · {unit}</span>
              </div>
            </>
          ) : null}
        </section> : null}

        {ready && activities.length > 0 ? (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Period polarization</h2>
                <p className="mt-0.5 text-xs text-white/45">Time in each zone for {windowLabel}</p>
              </div>
              <Segment
                label="Polarization zones"
                value={polarStyle}
                options={[
                  { id: '3', label: '3 zones' },
                  { id: '5', label: '5 zones' },
                ]}
                onChange={setPolarStyle}
              />
            </div>
            <PolarBar shares={shares} />
          </section>
        ) : null}
    </div>
  )
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-md bg-white/5 p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded px-2.5 py-1 text-xs ${value === option.id ? 'bg-white/15 text-white' : 'text-white/55'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function PolarBar({ shares }: { shares: { key: string; label: string; color: string; seconds: number }[] }) {
  const total = shares.reduce((sum, share) => sum + share.seconds, 0)
  if (total <= 0) return <p className="mt-8 text-sm text-[#9AA3B5]">No heart-rate data in this period.</p>
  return (
    <div className="mt-3">
      <div className="flex h-1.5 overflow-hidden rounded-full">
        {shares.map((share) =>
          share.seconds <= 0 ? null : (
            <div key={share.key} style={{ width: `${(share.seconds / total) * 100}%`, background: share.color }} title={`${share.label} ${formatDuration(share.seconds)}`} />
          ),
        )}
      </div>
      <ul className="mt-3 space-y-1">
        {shares.map((share) => {
          const percent = Math.round((share.seconds / total) * 100)
          return (
            <li key={share.key} className="flex items-center gap-2 text-xs text-white/70">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: share.color }} />
              <span className="w-16 font-semibold">{share.label}</span>
              <span className="tabular-nums text-[#E8EAF0]">{formatDuration(share.seconds)}</span>
              <span className="text-[#9AA3B5]">{percent}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function formatTick(metric: LoadMetric, value: number): string {
  if (metric === 'elevation') return `${Math.round(value)}`
  if (value < 10) return value.toFixed(1)
  return `${Math.round(value)}`
}

function formatValue(metric: LoadMetric, value: number): string {
  const unit = metric === 'hour' ? 'h' : metric === 'elevation' ? 'm' : 'km'
  const shown = metric === 'elevation' || value >= 10 ? Math.round(value) : value.toFixed(1)
  return `${shown} ${unit}`
}

function LoadTip({
  active,
  payload,
  metric,
  showLoad,
  style,
}: TooltipContentProps & { metric: LoadMetric; showLoad: boolean; style: ZoneStyle }) {
  const row = payload?.[0]?.payload as ({ label: string; total: number; change: number | null } & Record<string, number>) | undefined
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-white/15 bg-[#0b0e14] px-3 py-2 text-xs shadow-lg">
      <p className="text-white/45">{row.label}</p>
      <p className="mt-1 font-medium text-white">{formatValue(metric, row.total)}</p>
      <ul className="mt-1 space-y-0.5">
        {ZONE_BANDS[style].map((band) => {
          const amount = Number(row[band.key]) || 0
          const share = row.total > 0 ? Math.round((amount / row.total) * 100) : 0
          return (
            <li key={band.key} className="flex items-center gap-2 text-white/70">
              <span className="h-2 w-2 rounded-sm" style={{ background: band.color }} />
              {band.label} {share}%
            </li>
          )
        })}
      </ul>
      {showLoad && row.change !== null ? <p className="mt-1 text-white/70">{row.change > 0 ? '+' : ''}{Math.round(row.change)}% vs previous week</p> : null}
    </div>
  )
}

function LoadMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 11.5 5.5 8l2.2 2.2L14 4" />
      <path d="M10 4h4v4" />
    </svg>
  )
}
