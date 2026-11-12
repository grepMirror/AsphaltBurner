import type { BarItem, StackedBar, XYPoint } from '../data/matrix'

type Tick = { value: number; label: string }

type ExtraLine = {
  points: XYPoint[]
  color: string
  dashed?: boolean
  width?: number
}

type Dot = { x: number; y: number; color?: string; ring?: boolean }

type XYChartProps = {
  points: XYPoint[]
  xDomain: [number, number]
  yDomain: [number, number]
  xTicks: Tick[]
  yTicks: Tick[]
  color: string
  xScale?: 'linear' | 'log'
  xLabel?: string
  yLabel?: string
  showBand?: boolean
  showLine?: boolean
  showDots?: boolean
  extraLines?: ExtraLine[]
  dots?: Dot[]
  rug?: number[]
  height?: number
}

const PAD = { l: 58, r: 28, t: 16, b: 42 }

function xOf(value: number, domain: [number, number], scale: 'linear' | 'log', width: number): number {
  const [min, max] = domain
  const span = scale === 'log' ? Math.log(max) - Math.log(min) : max - min
  const pos = scale === 'log' ? Math.log(value) - Math.log(min) : value - min
  return PAD.l + (pos / span) * (width - PAD.l - PAD.r)
}

function yOf(value: number, domain: [number, number], height: number): number {
  const [min, max] = domain
  return PAD.t + (1 - (value - min) / (max - min)) * (height - PAD.t - PAD.b)
}

function linePath(
  points: XYPoint[],
  xDomain: [number, number],
  yDomain: [number, number],
  scale: 'linear' | 'log',
  width: number,
  height: number,
): string {
  return points
    .map((point, index) => {
      const cmd = index === 0 ? 'M' : 'L'
      return `${cmd}${xOf(point.x, xDomain, scale, width)},${yOf(point.y, yDomain, height)}`
    })
    .join(' ')
}

export function XYChart({
  points,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  color,
  xScale = 'linear',
  xLabel,
  yLabel,
  showBand = false,
  showLine = true,
  showDots = false,
  extraLines = [],
  dots = [],
  rug = [],
  height = 280,
}: XYChartProps) {
  const width = 860
  const plotRight = width - PAD.r
  const plotBottom = height - PAD.b

  const band =
    showBand && points.every((point) => point.low !== undefined && point.high !== undefined)
      ? `${points
          .map((point, index) => {
            const cmd = index === 0 ? 'M' : 'L'
            return `${cmd}${xOf(point.x, xDomain, xScale, width)},${yOf(point.high ?? point.y, yDomain, height)}`
          })
          .join(' ')} ${[...points]
          .reverse()
          .map((point) => `L${xOf(point.x, xDomain, xScale, width)},${yOf(point.low ?? point.y, yDomain, height)}`)
          .join(' ')} Z`
      : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img">
      {yTicks.map((tick) => {
        const y = yOf(tick.value, yDomain, height)
        return (
          <g key={tick.label}>
            <line x1={PAD.l} x2={plotRight} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" />
            <text x={PAD.l - 8} y={y + 4} textAnchor="end" fill="rgba(231,237,245,0.45)" fontSize="11">
              {tick.label}
            </text>
          </g>
        )
      })}
      {yLabel ? (
        <text
          x="16"
          y={height / 2}
          fill="rgba(231,237,245,0.45)"
          fontSize="11"
          transform={`rotate(-90 16 ${height / 2})`}
          textAnchor="middle"
        >
          {yLabel}
        </text>
      ) : null}
      {showBand ? <path d={band} fill={color} opacity="0.18" /> : null}
      {extraLines.map((line, index) => (
        <path
          key={index}
          d={linePath(line.points, xDomain, yDomain, xScale, width, height)}
          fill="none"
          stroke={line.color}
          strokeWidth={line.width ?? 1.5}
          strokeDasharray={line.dashed ? '5 4' : undefined}
        />
      ))}
      {showLine ? (
        <path d={linePath(points, xDomain, yDomain, xScale, width, height)} fill="none" stroke={color} strokeWidth="2.4" />
      ) : null}
      {showDots
        ? points.map((point) => (
            <circle
              key={`${point.x}-${point.y}`}
              cx={xOf(point.x, xDomain, xScale, width)}
              cy={yOf(point.y, yDomain, height)}
              r="3.5"
              fill={color}
            />
          ))
        : null}
      {dots.map((dot, index) => (
        <g key={index}>
          {dot.ring ? (
            <circle
              cx={xOf(dot.x, xDomain, xScale, width)}
              cy={yOf(dot.y, yDomain, height)}
              r="8"
              fill="none"
              stroke={dot.color ?? color}
              strokeWidth="1.5"
            />
          ) : null}
          <circle
            cx={xOf(dot.x, xDomain, xScale, width)}
            cy={yOf(dot.y, yDomain, height)}
            r="4"
            fill={dot.color ?? color}
          />
        </g>
      ))}
      {rug.map((value) => (
        <line
          key={value}
          x1={xOf(value, xDomain, xScale, width)}
          x2={xOf(value, xDomain, xScale, width)}
          y1={plotBottom}
          y2={plotBottom + 8}
          stroke="rgba(255,255,255,0.28)"
        />
      ))}
      {xTicks.map((tick) => (
        <text
          key={tick.label}
          x={xOf(tick.value, xDomain, xScale, width)}
          y={height - 16}
          textAnchor="middle"
          fill="rgba(231,237,245,0.45)"
          fontSize="11"
        >
          {tick.label}
        </text>
      ))}
      {xLabel ? (
        <text x={width / 2} y={height - 2} textAnchor="middle" fill="rgba(231,237,245,0.38)" fontSize="11">
          {xLabel}
        </text>
      ) : null}
    </svg>
  )
}

type HBarProps = {
  bars: BarItem[]
  max: number
  color: string
  marker?: number
  markerLabel?: string
  ticks: Tick[]
}

export function HBars({ bars, max, color, marker, markerLabel, ticks }: HBarProps) {
  const width = 860
  const row = 36
  const height = 28 + bars.length * row
  const left = 72
  const right = 78

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full" role="img">
      {ticks.map((tick) => {
        const x = left + (tick.value / max) * (width - left - right)
        return (
          <g key={tick.label}>
            <line x1={x} x2={x} y1={8} y2={height - 8} stroke="rgba(255,255,255,0.08)" />
            <text x={x} y={height - 2} textAnchor="middle" fill="rgba(231,237,245,0.4)" fontSize="11">
              {tick.label}
            </text>
          </g>
        )
      })}
      {marker !== undefined ? (
        <g>
          <line
            x1={left + (marker / max) * (width - left - right)}
            x2={left + (marker / max) * (width - left - right)}
            y1={4}
            y2={height - 16}
            stroke="rgba(255,255,255,0.55)"
            strokeDasharray="3 3"
          />
          {markerLabel ? (
            <text
              x={left + (marker / max) * (width - left - right)}
              y={12}
              textAnchor="middle"
              fill="rgba(231,237,245,0.7)"
              fontSize="11"
            >
              {markerLabel}
            </text>
          ) : null}
        </g>
      ) : null}
      {bars.map((bar, index) => {
        const y = 18 + index * row
        const w = (bar.value / max) * (width - left - right)
        return (
          <g key={bar.label}>
            <text x={left - 10} y={y + 12} textAnchor="end" fill="rgba(231,237,245,0.72)" fontSize="12">
              {bar.label}
            </text>
            <rect x={left} y={y} width={Math.max(w, 2)} height="16" rx="2" fill={color} />
            <text x={left + w + 8} y={y + 12} fill="#fff" fontSize="12">
              {bar.display ?? bar.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

type VBarProps = {
  bars: BarItem[]
  color: string
  yLabel?: string
  yMax?: number
}

export function VBars({ bars, color, yLabel, yMax }: VBarProps) {
  const width = 860
  const height = 240
  const left = yLabel ? 58 : 28
  const max = yMax ?? Math.max(...bars.map((bar) => bar.value), 1)
  const slot = (width - left - 16) / bars.length

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img">
      <line x1={left} x2={width - 12} y1={height - 28} y2={height - 28} stroke="rgba(255,255,255,0.12)" />
      {yLabel ? (
        <text x="14" y={height / 2} fill="rgba(231,237,245,0.45)" fontSize="11" transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle">
          {yLabel}
        </text>
      ) : null}
      {bars.map((bar, index) => {
        const h = (bar.value / max) * (height - 56)
        const x = left + index * slot + slot * 0.18
        const barWidth = slot * 0.64
        return (
          <g key={bar.label}>
            <rect x={x} y={height - 28 - h} width={barWidth} height={h} rx="2" fill={color} opacity="0.9" />
            <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" fill="rgba(231,237,245,0.5)" fontSize="11">
              {bar.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

type StackedProps = {
  bars: StackedBar[]
  colors: string[]
  yLabel: string
}

export function StackedBars({ bars, colors, yLabel }: StackedProps) {
  const width = 860
  const height = 240
  const left = 52
  const max = Math.max(...bars.map((bar) => bar.parts.reduce((sum, part) => sum + part, 0)), 1)
  const slot = (width - left - 16) / Math.max(bars.length, 1)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img">
      <text x="14" y={height / 2} fill="rgba(231,237,245,0.45)" fontSize="11" transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle">
        {yLabel}
      </text>
      {bars.map((bar, index) => {
        const x = left + index * slot + slot * 0.22
        const barWidth = slot * 0.56
        let cursor = height - 28
        return (
          <g key={bar.label}>
            {bar.parts.map((part, partIndex) => {
              const h = (part / max) * (height - 56)
              cursor -= h
              return <rect key={partIndex} x={x} y={cursor} width={barWidth} height={h} fill={colors[partIndex]} opacity={0.55 + partIndex * 0.15} />
            })}
            <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" fill="rgba(231,237,245,0.5)" fontSize="11">
              {bar.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function ZoneBar({ bars, color }: { bars: BarItem[]; color: string }) {
  const total = bars.reduce((sum, bar) => sum + bar.value, 0)
  return (
    <div className="mt-4">
      <div className="flex h-8 overflow-hidden rounded-md">
        {bars.map((bar, index) => (
          <div
            key={bar.label}
            style={{ width: `${(bar.value / total) * 100}%`, background: color, opacity: 1 - index * 0.16 }}
            title={`${bar.label} ${bar.value}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs text-white/55">
        {bars.map((bar) => (
          <span key={bar.label}>
            {bar.label} · {bar.value}%
          </span>
        ))}
      </div>
    </div>
  )
}
