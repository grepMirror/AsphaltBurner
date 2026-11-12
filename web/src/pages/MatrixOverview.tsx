import { Radar } from '../components/Radar'
import { matrixScore, profile } from '../data/matrix'

export function MatrixOverview() {
  const score = matrixScore()

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/70">← Today</span>
        <span className="text-sm text-white/45">Give feedback</span>
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-4">
        <p className="font-display text-6xl font-semibold leading-none">
          {score}
          <span className="text-2xl font-medium text-white/40">/100</span>
        </p>
        <div>
          <h1 className="font-display text-4xl font-semibold">{profile.archetype}</h1>
          <p className="mt-1 text-sm text-white/45">Mean of the six dimension scores.</p>
        </div>
      </div>

      <div className="mt-6">
        <Radar size={460} />
      </div>
    </div>
  )
}
