import { useEffect, useMemo, useState } from 'react'
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
import { loadBundle } from '../lib/store'
import type { Activity, DateWindow } from '../types'

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

export function LoadPage({ maxHr }: { maxHr: number }) {
  const [ready, setReady] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<LoadRange>('8w')
  const [custom, setCustom] = useState<DateWindow | null>(null)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const [style, setStyle] = useState<ZoneStyle>('3')
  const [polarStyle, setPolarStyle] = useState<ZoneStyle>('3')
  const [metric, setMetric] = useState<LoadMetric>('volume')
  const [showLoad, setShowLoad] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadBundle()
      .then((bundle) => {
        if (cancelled || !bundle) return
        setActivities(bundle.activities.map((activity) => ({ ...activity, stream: activity.stream ?? [] })))
      })
      .catch(() => {
        if (!cancelled) setError('Saved sessions could not be opened.')
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const windowLabel = loadWindowLabel(range, custom)
  const weeks = useMemo(() => buildLoadWeeks(activities, range, custom, metric, style, maxHr), [activities, range, custom, metric, style, maxHr])
  const shares = useMemo(() => periodZoneShares(activities, range, custom, polarStyle, maxHr), [activities, range, custom, polarStyle, maxHr])
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
    <div className="calendar-page min-h-[calc(100vh-3.5rem)] px-10 pb-14 pt-10">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-[40px] font-semibold leading-none tracking-tight">Training load</h1>
            <p className="mt-2 text-sm text-[#9AA3B5]">{windowLabel}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex rounded-xl border border-[#262C3B] bg-[#12161E] p-1" role="group" aria-label="Date range">
              {RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseRange(item.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${range === item.id ? 'bg-[#1C2231] text-[#E8EAF0]' : 'text-[#9AA3B5]'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {range === 'custom' ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const next = parseCustomDraft(draftStart, draftEnd)
                  if (next) setCustom(next)
                }}
              >
                <input type="date" required value={draftStart} onChange={(event) => setDraftStart(event.target.value)} className="rounded-lg border border-[#262C3B] bg-[#0B0D12] px-2 py-1.5 text-sm text-[#E8EAF0] [color-scheme:dark]" />
                <input type="date" required value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} className="rounded-lg border border-[#262C3B] bg-[#0B0D12] px-2 py-1.5 text-sm text-[#E8EAF0] [color-scheme:dark]" />
                <button type="submit" className="rounded-lg bg-[#E8EAF0] px-3 py-1.5 text-sm font-semibold text-[#0B0D12]">
                  Apply
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {!ready ? <p className="text-sm text-[#9AA3B5]">Loading saved sessions…</p> : null}
        {error ? <p className="text-sm text-[#FECACA]">{error}</p> : null}

        <section className="rounded-[22px] border border-[#1E2330] bg-[#10131A] p-[22px]">
          <div className="flex flex-wrap items-center justify-end gap-2">
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
              className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${showLoad ? 'border-[#E8EAF0] bg-[#1C2231] text-[#E8EAF0]' : 'border-[#262C3B] bg-[#12161E] text-[#9AA3B5]'}`}
            >
              <LoadMark />
              Training load
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
        </section>

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <section className="rounded-[22px] border border-[#1E2330] bg-[#10131A] p-[22px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Period polarization</h2>
                <p className="mt-1 text-xs text-[#9AA3B5]">Time in each zone for {windowLabel}</p>
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
          <section aria-label="Reserved" className="rounded-[22px] border border-[#1E2330] bg-[#10131A]" />
        </div>
      </div>
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
    <div className="flex rounded-xl border border-[#262C3B] bg-[#12161E] p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${value === option.id ? 'bg-[#1C2231] text-[#E8EAF0]' : 'text-[#9AA3B5]'}`}
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
    <div className="mt-6">
      <div className="flex h-8 overflow-hidden rounded-lg">
        {shares.map((share) =>
          share.seconds <= 0 ? null : (
            <div key={share.key} style={{ width: `${(share.seconds / total) * 100}%`, background: share.color }} title={`${share.label} ${formatDuration(share.seconds)}`} />
          ),
        )}
      </div>
      <ul className="mt-4 space-y-2">
        {shares.map((share) => {
          const percent = Math.round((share.seconds / total) * 100)
          return (
            <li key={share.key} className="flex items-center gap-3 text-sm">
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
        {ZONE_BANDS[style].map((band) => (
          <li key={band.key} className="flex items-center gap-2 text-white/70">
            <span className="h-2 w-2 rounded-sm" style={{ background: band.color }} />
            {band.label} {formatValue(metric, Number(row[band.key]) || 0)}
          </li>
        ))}
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
