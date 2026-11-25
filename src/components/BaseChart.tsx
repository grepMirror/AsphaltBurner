import { useState, type ReactNode } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GRID, TICK } from './chartChrome'
import { ChartFrame } from './ChartFrame'

/** A series of bars. A stack shares a `stackId`. `colorOf` gives each row its own color. */
export type BarSeries<R> = {
  key: string
  color: string
  colorOf?: (row: R, index: number) => string
  stackId?: string
  radius?: [number, number, number, number]
  maxBarSize?: number
}

/** A line over the bars. On the right axis when `axis` is the id given to `rightAxis`. */
export type LineSeries = { key: string; color: string; axis?: string; width?: number }

/** How one row is drawn: faded, or outlined. */
export type RowStyle = { opacity?: number; outline?: string }

type Props<R> = {
  /** Names the chart for the fullscreen button on a phone. */
  label: string
  rows: R[]
  /** Key of the row that holds the text under each bar. */
  xKey: string
  bars: BarSeries<R>[]
  lines?: LineSeries[]
  /** A dashed vertical line on one x value, for example the run. */
  markers?: { x: string; label: string; color: string }[]
  rowStyle?: (row: R, index: number) => RowStyle
  /** The x value shown in bold, for example this week. */
  current?: string | null
  /** The content of the tooltip card for one row. */
  tooltip: (row: R) => ReactNode
  yFormat?: (value: number) => string
  yWidth?: number
  /** Show every label (0) or let the chart skip the ones that do not fit. */
  xInterval?: number
  rightAxis?: { id: string; format: (value: number) => string; width?: number }
  /** Size of the chart when it is not fullscreen. */
  className?: string
  /** Read by screen readers in place of the picture. */
  summary?: string
  /** More chart layers, drawn under the bars. */
  children?: ReactNode
}

/**
 * The base bar chart of the app. Hovering a bar fades the others and opens a card with the details of that row.
 * Pages give it rows and say how a bar is colored, faded or outlined; the look and the interaction stay the same everywhere.
 * On a phone a button opens it fullscreen.
 */
export function BaseChart<R extends Record<string, unknown>>(props: Props<R>) {
  return <ChartFrame label={props.label}>{(full) => <Plot {...props} full={full} />}</ChartFrame>
}

function Plot<R extends Record<string, unknown>>({
  rows,
  xKey,
  bars,
  lines,
  markers,
  rowStyle,
  current,
  tooltip,
  yFormat,
  yWidth = 40,
  xInterval,
  rightAxis,
  className = 'mt-4 h-56 sm:h-72',
  summary,
  children,
  full,
}: Props<R> & { full: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const format = yFormat ?? ((value: number) => String(value))

  return (
    <>
      {summary ? <p className="sr-only">{summary}</p> : null}
      <div className={full ? 'h-full' : className} aria-hidden={summary ? true : undefined} onMouseLeave={() => setHover(null)}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: markers?.length ? 20 : 10, right: rightAxis ? 12 : 8, left: 0, bottom: 0 }}
            barCategoryGap="18%"
            onMouseMove={(state) => {
              const raw = state.activeTooltipIndex
              const index = typeof raw === 'number' ? raw : Number(raw)
              setHover(raw == null || raw === '' || !Number.isInteger(index) ? null : index)
            }}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              interval={xInterval ?? "preserveStartEnd"}
              minTickGap={6}
              tick={(tick: { x?: number | string; y?: number | string; payload?: { value?: string | number } }) => {
                const value = String(tick.payload?.value ?? '')
                const now = current != null && value === current
                return (
                  <text x={Number(tick.x)} y={Number(tick.y) + 12} textAnchor="middle" fontSize={11} fontWeight={now ? 700 : 400} fill={now ? '#FFFFFF' : TICK.fill}>
                    {value}
                  </text>
                )
              }}
            />
            <YAxis width={yWidth} domain={[0, 'auto']} tick={TICK} tickLine={false} axisLine={false} tickFormatter={format} />
            {rightAxis ? (
              <YAxis yAxisId={rightAxis.id} orientation="right" width={rightAxis.width ?? 42} tick={TICK} tickLine={false} axisLine={false} tickFormatter={rightAxis.format} />
            ) : null}
            <Tooltip
              content={(tip) => {
                const row = tip.payload?.[0]?.payload as R | undefined
                if (!tip.active || !row) return null
                return <div className="min-w-[11rem] rounded-xl border border-[#2A3140] bg-[#0B0D12] px-3 py-2.5 text-xs shadow-xl">{tooltip(row)}</div>
              }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            {markers?.map((marker) => (
              <ReferenceLine key={marker.x} x={marker.x} stroke={marker.color} strokeDasharray="3 3" label={{ value: marker.label, position: 'top', fill: marker.color, fontSize: 10, fontWeight: 600 }} />
            ))}
            {children}
            {bars.map((series) => (
              <Bar key={series.key} dataKey={series.key} stackId={series.stackId} radius={series.radius ?? (bars.length === 1 ? [4, 4, 0, 0] : undefined)} maxBarSize={series.maxBarSize ?? 34} isAnimationActive={false}>
                {rows.map((row, index) => {
                  const style = rowStyle?.(row, index)
                  // The hovered bar stays as it is, the others step back.
                  const faded = hover !== null && hover !== index
                  return (
                    <Cell
                      key={index}
                      fill={series.colorOf ? series.colorOf(row, index) : series.color}
                      fillOpacity={faded ? 0.3 : (style?.opacity ?? 1)}
                      stroke={style?.outline ?? 'none'}
                      strokeWidth={style?.outline ? 1.5 : 0}
                    />
                  )
                })}
              </Bar>
            ))}
            {lines?.map((line) => (
              <Line
                key={line.key}
                dataKey={line.key}
                yAxisId={line.axis}
                type="monotone"
                stroke={line.color}
                strokeWidth={line.width ?? 2}
                connectNulls={false}
                dot={{ r: 3, fill: line.color, stroke: '#10131A', strokeWidth: 1.5 }}
                activeDot={{ r: 4.5, fill: line.color, stroke: '#10131A', strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
