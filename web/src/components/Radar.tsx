import { Link } from 'react-router-dom'
import { dimensions, formatScore, type DimensionId } from '../data/matrix'

type RadarProps = {
  size?: number
  activeId?: DimensionId
  showLabels?: boolean
}

function point(index: number, total: number, ratio: number, radius: number, center: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total
  return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio]
}

export function Radar({ size = 360, activeId, showLabels = true }: RadarProps) {
  const center = size / 2
  const radius = showLabels ? size * 0.32 : size * 0.38
  const scores = dimensions.map((dimension) => dimension.score)
  const polygon = scores
    .map((score, index) => point(index, scores.length, score / 100, radius, center).join(','))
    .join(' ')
  const gradientId = `radar-fill-${activeId ?? 'all'}-${size}`

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="mx-auto" role="img" aria-label="Runner matrix radar">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((ring) => {
        const ringPoints = dimensions
          .map((_, index) => point(index, dimensions.length, ring, radius, center).join(','))
          .join(' ')
        return <polygon key={ring} points={ringPoints} fill="none" stroke="rgba(255,255,255,0.12)" />
      })}
      {dimensions.map((_, index) => {
        const [x, y] = point(index, dimensions.length, 1, radius, center)
        return <line key={index} x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" />
      })}
      <polygon points={polygon} fill={`url(#${gradientId})`} stroke="#7dd3fc" strokeWidth={showLabels ? 2 : 1.4} />
      {dimensions.map((dimension, index) => {
        const [x, y] = point(index, dimensions.length, dimension.score / 100, radius, center)
        const active = dimension.id === activeId
        return <circle key={dimension.id} cx={x} cy={y} r={active ? 4.5 : 3} fill={active ? dimension.color : '#dbeafe'} />
      })}
      {showLabels
        ? dimensions.map((dimension, index) => {
            const [x, y] = point(index, dimensions.length, 1.28, radius, center)
            return (
              <Link key={dimension.id} to={`/matrix/${dimension.id}`} aria-label={`Open ${dimension.label}`}>
                <rect x={x - 46} y={y - 16} width="92" height="40" fill="transparent" />
                <text x={x} y={y} textAnchor="middle" fill="rgba(231,237,245,0.82)" fontSize="13">
                  <tspan x={x} dy="0">
                    {dimension.label}
                  </tspan>
                  <tspan x={x} dy="16" fill={dimension.color} fontWeight="600">
                    {formatScore(dimension.score)}
                  </tspan>
                </text>
              </Link>
            )
          })
        : null}
    </svg>
  )
}
