import { useState, type ReactNode } from 'react'
import { DEFAULT_ZONES, clampMaxHr, clampRestHr, clampZones, reserveRest, zoneCutBpm, type HrMethod, type ZoneEdges } from '../lib/intensity'
import { Segment } from './Segment'

const ZONE_COLORS = ['#1F6F8B', '#5EB0C8', '#FACC15', '#FB923C', '#DC2626']

export type HeartRateValues = {
  maxHr: number
  restHr: number
  method: HrMethod
  zones: ZoneEdges
}

/**
 * Heart-rate settings of one profile: method, max and resting rate, and the zone limits.
 * Give it a `key` that changes with the profile, so the fields start again from that profile's values.
 */
export function HeartRatePanel({ values, onChange }: { values: HeartRateValues; onChange: (patch: Partial<HeartRateValues>) => void }) {
  const { maxHr, restHr, method, zones } = values
  const [draft, setDraft] = useState(String(maxHr))
  const [restDraft, setRestDraft] = useState(String(restHr))
  const [zoneDraft, setZoneDraft] = useState(() => zones.map(String))
  const [showNote, setShowNote] = useState(false)

  const apply = (raw: string) => {
    setDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 100 || parsed > 230) return
    onChange({ maxHr: parsed })
  }

  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(String(maxHr))
      return
    }
    onChange({ maxHr: parsed })
    setDraft(String(clampMaxHr(parsed)))
  }

  const applyRest = (raw: string) => {
    setRestDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 30 || parsed > 100) return
    onChange({ restHr: parsed })
  }

  const commitRest = () => {
    const parsed = Number(restDraft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRestDraft(String(restHr))
      return
    }
    onChange({ restHr: parsed })
    setRestDraft(String(clampRestHr(parsed)))
  }

  const commitZones = () => {
    const next = clampZones(zoneDraft.map(Number))
    onChange({ zones: next })
    setZoneDraft(next.map(String))
  }

  const parsed = zoneDraft.map(Number)
  const shown = (parsed.every((value) => Number.isFinite(value)) ? parsed : [...zones]) as unknown as ZoneEdges
  const cuts = zoneCutBpm(maxHr, shown, { restHr, method }).map((value: number) => Math.round(value))
  const floor = method === 'karvonen' ? Math.round(reserveRest(maxHr, restHr)) : 0
  const edges = [floor, ...cuts, maxHr]

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-white/55">Intensity Zone :</span>
        <Segment
          label="Intensity"
          value={method}
          options={[
            { id: 'max', label: '% max' },
            { id: 'karvonen', label: 'FCR' },
          ]}
          onChange={(next) => onChange({ method: next })}
        />
        {method === 'karvonen' ? <KarvonenToggle open={showNote} onToggle={() => setShowNote((current) => !current)} /> : null}
      </div>
      {method === 'karvonen' && showNote ? <KarvonenNote /> : null}
      <div className="mt-3 flex gap-2">
        <BpmField label="Max heart rate" icon={<HeartIcon />} value={draft} min={100} max={230} onChange={apply} onCommit={commit} />
        {method === 'karvonen' ? <BpmField label="Resting heart rate" hint="Rest HR" icon={<RestIcon />} value={restDraft} min={30} max={100} onChange={applyRest} onCommit={commitRest} /> : null}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {zoneDraft.map((value, index) => (
          <label key={DEFAULT_ZONES[index]} className="text-center">
            <span className="mb-1 flex items-center justify-center gap-1 text-[10px] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ZONE_COLORS[index] }} />
              Z{index + 1}
            </span>
            <input
              type="number"
              min={40}
              max={99}
              inputMode="numeric"
              aria-label={`Zone ${index + 1} upper percent`}
              value={value}
              onChange={(event) => setZoneDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
              onBlur={commitZones}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="w-full rounded-md border border-white/15 bg-black px-1 py-1.5 text-center text-sm tabular-nums text-white outline-none focus:border-white/40"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full" aria-hidden>
        {ZONE_COLORS.map((color, index) => (
          <span key={color} style={{ width: `${((edges[index + 1] - edges[index]) / Math.max(1, edges[edges.length - 1] - edges[0])) * 100}%`, background: color }} />
        ))}
      </div>
      <div className="mt-1 flex text-[10px] tabular-nums text-white/40" aria-hidden>
        {edges.slice(1).map((edge, index) => (
          <span key={`${edge}-${index}`} className="min-w-0 text-right" style={{ width: `${((edges[index + 1] - edges[index]) / Math.max(1, edges[edges.length - 1] - edges[0])) * 100}%` }}>
            {edge}
          </span>
        ))}
      </div>
    </div>
  )
}

function BpmField({
  label,
  hint,
  icon,
  value,
  min,
  max,
  onChange,
  onCommit,
}: {
  label: string
  hint?: string
  icon: ReactNode
  value: string
  min: number
  max: number
  onChange: (value: string) => void
  onCommit: () => void
}) {
  return (
    <label title={hint} className="group relative flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-2">
      {hint ? <span className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded bg-black px-1.5 py-0.5 text-[10px] text-white group-hover:block">{hint}</span> : null}
      <span className="text-white/55">{icon}</span>
      <input
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="w-full bg-transparent text-sm tabular-nums text-white outline-none"
      />
    </label>
  )
}

/** Info button next to the method switch. It only toggles the note below the row, so no popup is clipped by the modal. */
function KarvonenToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label="Karvonen method"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 ring-inset ${open ? 'text-sky-200 ring-sky-300/50' : 'text-white/50 ring-white/25 hover:text-white/80'}`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <circle cx="8" cy="4.6" r="0.75" fill="currentColor" />
      </svg>
    </button>
  )
}

/** Explanation of the Karvonen (heart-rate reserve) method. Rendered in the normal flow so the scrolling popup shows it in full. */
function KarvonenNote() {
  return (
    <div className="mt-3 rounded-lg border border-white/15 bg-white/[0.03] p-3 text-left text-xs leading-relaxed text-white/70">
      <p className="font-medium text-white/85">Target HR = resting HR + % × (max HR − resting HR)</p>
      <ul className="mt-2 space-y-1.5">
        <li>Zones are personal. Two runners with the same max but different resting rates (45 versus 70) do not share the same zones. Percent of max would give them the same thresholds.</li>
        <li>It tracks real effort more closely. A percent of heart-rate reserve is close to a percent of VO2 reserve.</li>
        <li>Resting heart rate changes over time, so comparing a long period is unreliable.</li>
      </ul>
    </div>
  )
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M8 13.2S2.6 9.6 2.6 6.3A2.7 2.7 0 0 1 8 5.2a2.7 2.7 0 0 1 5.4 1.1c0 3.3-5.4 6.9-5.4 6.9Z" />
    </svg>
  )
}

function RestIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M1.5 8h3l1.2-2.4 1.6 4.8L9 8h5.5" />
    </svg>
  )
}
