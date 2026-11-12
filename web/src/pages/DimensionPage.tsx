import { Link, Navigate, useParams } from 'react-router-dom'
import { Radar } from '../components/Radar'
import { DimensionCharts } from '../components/DimensionCharts'
import { dimensionById, dimensions, formatScore, neighbor, profile, type DimensionId } from '../data/matrix'

export function DimensionPage() {
  const { dimensionId = '' } = useParams()
  const dimension = dimensionById(dimensionId)
  if (!dimension) {
    return <Navigate to="/matrix" replace />
  }

  const previous = neighbor(dimension.id, -1)
  const next = neighbor(dimension.id, 1)

  return (
    <div>
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        <Link to="/matrix" className="shrink-0 text-sm text-white/70">
          ← My matrix
        </Link>
        <span className="h-4 w-px shrink-0 bg-white/20" />
        <nav aria-label="Switch dimension" className="flex items-center gap-1">
          {dimensions.map((item) => {
            const active = item.id === dimension.id
            return (
              <Link
                key={item.id}
                to={`/matrix/${item.id}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm"
                style={
                  active
                    ? { background: `${item.color}22`, color: item.color, outline: `1px solid ${item.color}55` }
                    : { color: item.color }
                }
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                {item.label} {formatScore(item.score)}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Radar size={92} activeId={dimension.id as DimensionId} showLabels={false} />
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
          <span className="inline-block h-3.5 w-3.5" style={{ background: dimension.color }} />
          {dimension.label}
        </h1>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <p className="font-display text-6xl font-semibold leading-none">
            {formatScore(dimension.score)}
            <span className="text-2xl text-white/35">/100</span>
          </p>
          <span className="text-sm font-medium" style={{ color: dimension.color }}>
            {dimension.percentile}
          </span>
          <span className="text-sm text-white/55">{dimension.seeRuns} ›</span>
        </div>
        <p className="text-xs text-white/40">Data · {profile.dataDays} d</p>
      </div>
      <p className="mt-3 max-w-xl text-sm text-white/45">{dimension.blurb}</p>

      <DimensionCharts dimension={dimension} />

      <nav aria-label="Switch dimension" className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10">
        <Link to={`/matrix/${previous.id}`} className="px-4 py-3 hover:bg-white/5">
          <span className="block text-[11px] uppercase tracking-[0.14em] text-white/40">← Previous</span>
          <span className="mt-1 block text-sm" style={{ color: previous.color }}>
            {previous.label} {formatScore(previous.score)}
          </span>
        </Link>
        <Link to={`/matrix/${next.id}`} className="border-l border-white/10 px-4 py-3 text-right hover:bg-white/5">
          <span className="block text-[11px] uppercase tracking-[0.14em] text-white/40">Next →</span>
          <span className="mt-1 block text-sm" style={{ color: next.color }}>
            {next.label} {formatScore(next.score)}
          </span>
        </Link>
      </nav>
    </div>
  )
}
