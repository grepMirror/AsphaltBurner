import { useMemo, useState } from 'react'
import { Line, useXAxisScale, useYAxisScale } from 'recharts'
import { LED_SKY, PAGE_BOX, TITLE } from '../components/layout'
import { BaseChart } from '../components/BaseChart'
import { Segment } from '../components/Segment'
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
import type { HrMethod, ZoneEdges } from '../lib/intensity'
import type { DateWindow } from '../types'

const RANGES: { id: LoadRange; label: string }[] = [
  { id: 'current', label: 'Current' },
  { id: '4w', label: '4 wk' },
  { id: '8w', label: '8 wk' },
  { id: '12w', label: '12 wk' },
  { id: 'custom', label: 'Custom' },
]

const METRICS: { id: LoadMetric; label: string; unit: string }[] = [
  { id: 'volume', label: 'Km', unit: 'km' },
  { id: 'hour', label: 'Hours', unit: 'h' },
  { id: 'elevation', label: 'd+', unit: 'm' },
]

export function LoadPage({ maxHr, restHr, method, split }: { maxHr: number; restHr: number; method: HrMethod; split: ZoneEdges }) {
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
  const basis = useMemo(() => ({ restHr, method }), [restHr, method])
  const weeks = useMemo(() => buildLoadWeeks(activities, range, custom, metric, style, maxHr, split, new Date(), basis), [activities, range, custom, metric, style, maxHr, split, basis])
  const shares = useMemo(() => periodZoneShares(activities, range, custom, polarStyle, maxHr, split, new Date(), basis), [activities, range, custom, polarStyle, maxHr, split, basis])
  const rows = weeks.map((week, index) => {
    const previous = index > 0 ? weeks[index - 1].total : 0
    return {
      label: week.label,
      total: week.total,
      change: week.change,
      bandLow: previous > 0 ? previous * 0.8 : null,
      bandHigh: previous > 0 ? previous * 1.2 : null,
      ...week.values,
    }
  })
  const unit = METRICS.find((item) => item.id === metric)?.unit ?? ''
  const hasBars = weeks.some((week) => week.total > 0)
  const byDay = range === 'current'
  const barNoun = byDay ? 'day' : 'week'

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
    <div className={`${PAGE_BOX} flex flex-col gap-4 pb-16 pt-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`flex items-center gap-2.5 ${TITLE}`}>
              <span className={LED_SKY}>
                <LoadMark size={22} />
              </span>
              Training load
            </h1>
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
              aria-label={byDay ? 'Day change' : 'Week change'}
              title={byDay ? 'Day change' : 'Week change'}
              className={`flex items-center rounded-md px-2 py-1.5 sm:py-1 ${showLoad ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5 text-white/55'}`}
            >
              <LoadMark />
            </button>
          </div>

          {ready && !hasBars && !byDay ? <p className="mt-8 text-sm text-[#9AA3B5]">No heart-rate data in this period, so the zones cannot be split.</p> : null}
          {hasBars || byDay ? (
            <>
              <BaseChart
                label="Training load"
                rows={rows}
                xKey="label"
                className="mt-4 h-[260px] sm:h-[360px]"
                yWidth={48}
                yFormat={(value) => formatTick(metric, value)}
                rightAxis={showLoad ? { id: 'change', format: (value) => `${Math.round(value)}%` } : undefined}
                bars={ZONE_BANDS[style].map((band, index) => ({
                  key: band.key,
                  color: band.color,
                  stackId: 'zone',
                  maxBarSize: 42,
                  radius: index === ZONE_BANDS[style].length - 1 ? ([4, 4, 0, 0] as [number, number, number, number]) : undefined,
                }))}
                lines={showLoad ? [{ key: 'change', color: '#E8EAF0', axis: 'change', width: 1.8 }] : undefined}
                tooltip={(row) => <LoadTip row={row} metric={metric} showLoad={showLoad} style={style} barNoun={barNoun} />}
              >
                <Line dataKey="bandHigh" stroke="none" dot={false} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false} />
                <LoadWindow rows={rows} />
              </BaseChart>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {ZONE_BANDS[style].map((band) => (
                  <span key={band.key} className="flex items-center gap-2 text-xs text-[#9AA3B5]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: band.color }} />
                    {band.label}
                  </span>
                ))}
                <span className="flex items-center gap-2 text-xs text-[#9AA3B5]">
                  <span className="h-2.5 w-4 rounded-sm bg-white/15" />
                  ±20% of previous {barNoun}
                </span>
                {showLoad ? (
                  <span className="flex items-center gap-2 text-xs text-[#9AA3B5]">
                    <span className="h-0.5 w-4 bg-[#E8EAF0]" />
                    {byDay ? 'Day change' : 'Week change'}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-[#9AA3B5]">{byDay ? 'Days' : 'Weeks'} · {unit}</span>
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

type ChartRow = Record<string, unknown> & { label: string; total: number; change: number | null; bandLow: number | null; bandHigh: number | null }

function LoadTip({ row, metric, showLoad, style, barNoun }: { row: ChartRow; metric: LoadMetric; showLoad: boolean; style: ZoneStyle; barNoun: 'day' | 'week' }) {
  return (
    <>
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
      {row.bandLow != null && row.bandHigh != null ? (
        <p className="mt-1 text-white/55">
          ±20% of previous {barNoun} · {formatValue(metric, row.bandLow)}–{formatValue(metric, row.bandHigh)}
        </p>
      ) : null}
      {showLoad && row.change !== null ? <p className="mt-1 text-white/70">{row.change > 0 ? '+' : ''}{Math.round(row.change)}% vs previous {barNoun}</p> : null}
    </>
  )
}

type LoadRow = { label: string; bandLow: number | null; bandHigh: number | null }

function LoadWindow({ rows }: { rows: LoadRow[] }) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  if (!xScale || !yScale) return null
  return (
    <g>
      {rows.map((row, index) => {
        if (row.bandLow == null || row.bandHigh == null) return null
        const start = xScale(row.label, { position: 'start' })
        const end = xScale(row.label, { position: 'end' })
        const top = yScale(row.bandHigh)
        const bottom = yScale(row.bandLow)
        if (start == null || end == null || top == null || bottom == null) return null
        const slot = end - start
        const width = Math.min(52, slot * 0.62)
        return <rect key={index} x={start + (slot - width) / 2} y={top} width={width} height={Math.max(0, bottom - top)} rx={3} fill="rgba(231,237,245,0.14)" />
      })}
    </g>
  )
}

function LoadMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 11.5 5.5 8l2.2 2.2L14 4" />
      <path d="M10 4h4v4" />
    </svg>
  )
}
