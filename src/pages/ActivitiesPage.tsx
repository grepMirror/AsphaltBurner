import { useEffect, useMemo, useState } from 'react'
import { ActivityMap } from '../components/ActivityMap'
import { SessionView } from '../components/SessionView'
import { SportIcon } from '../components/SportIcon'
import { VolumeChart } from '../components/VolumeChart'
import { useActivities } from '../lib/activities'
import type { ZoneEdges } from '../lib/intensity'
import { SPORTS, SPORT_LABEL, formatDistance, formatDuration, formatPaceOrSpeed, formatWhen } from '../lib/format'
import { formatWindow, inPeriod, weekWindow, windowBounds } from '../lib/period'
import type { Activity, DateWindow, MetricId, RangeId, Sport } from '../types'

export function ActivitiesPage({ maxHr, split }: { maxHr: number; split: ZoneEdges }) {
  const { ready, activities, report, clear } = useActivities()
  const [sports, setSports] = useState<Set<Sport>>(() => new Set(SPORTS))
  const [range, setRange] = useState<RangeId>('12m')
  const [custom, setCustom] = useState<DateWindow | null>(null)
  const [focusWeek, setFocusWeek] = useState<DateWindow | null>(null)
  const [metric, setMetric] = useState<MetricId>('km')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedId(null)
    setDetailId(null)
    setFocusWeek(null)
    setRange('12m')
  }, [activities])

  const sportFiltered = useMemo(
    () => activities.filter((activity) => sports.has(activity.sport)),
    [activities, sports],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return sportFiltered
      .filter((activity) => inPeriod(activity, range, new Date(), custom))
      .filter((activity) => {
        if (!needle) return true
        return activity.name.toLowerCase().includes(needle) || activity.type.toLowerCase().includes(needle)
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [sportFiltered, range, custom, query])

  const selected = activities.find((activity) => activity.id === selectedId) ?? null

  const selectActivity = (id: string) => {
    setSelectedId(id)
    const activity = activities.find((item) => item.id === id)
    if (!activity) return
    const when = new Date(activity.date)
    if (Number.isNaN(when.getTime())) return
    setFocusWeek(weekWindow(when))
  }

  const toggleSport = (sport: Sport) => {
    setSports((current) => {
      const next = new Set(current)
      if (next.has(sport)) next.delete(sport)
      else next.add(sport)
      return next
    })
  }

  const detail = activities.find((activity) => activity.id === detailId) ?? null

  if (!ready) {
    return <p className="text-sm text-white/60">Loading saved sessions…</p>
  }

  if (detail) {
    return <SessionView activity={detail} maxHr={maxHr} split={split} onBack={() => setDetailId(null)} />
  }

  return (
    <div className="relative">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Activities</h1>
          <p className="mt-1 text-sm text-white/55">Sessions from a Strava export. A direct connector can replace the zip later.</p>
        </div>
        {activities.length > 0 ? (
          <button
            type="button"
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70"
            onClick={() => clear()}
          >
            Clear
          </button>
        ) : null}
      </header>

      {report && report.source === 'zip' ? (
        <p className="mb-4 text-sm text-white/55">
          {report.sessions} sessions · {report.tracks} with a map
          {report.skipped ? ` · ${report.skipped} files skipped` : ''}
          {report.unreadable ? ` · ${report.unreadable} unreadable` : ''}
        </p>
      ) : null}

      {activities.length === 0 ? <p className="py-16 text-center text-sm text-white/55">No activity found</p> : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SPORTS.map((sport) => {
              const on = sports.has(sport)
              return (
                <button
                  key={sport}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSport(sport)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left text-sm ${
                    on ? 'border-white/15 bg-white/[0.04]' : 'border-white/5 bg-transparent text-white/35'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <SportIcon sport={sport} className="h-4 w-4" />
                    {SPORT_LABEL[sport]}
                  </span>
                  <span className={on ? 'text-sky-300' : 'text-white/25'}>{on ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>

          <VolumeChart
            activities={sportFiltered}
            range={range}
            custom={custom}
            metric={metric}
            focus={focusWeek}
            highlightTime={selected ? new Date(selected.date).getTime() : null}
            onRange={(next) => {
              setRange(next)
              setFocusWeek(null)
            }}
            onCustom={(window) => {
              setCustom(window)
              setRange('custom')
              setFocusWeek(null)
            }}
            onMetric={setMetric}
            onClearFocus={() => setFocusWeek(null)}
          />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="border-b border-white/10 p-3">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search sessions"
                  className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none placeholder:text-white/35"
                />
              </div>
              {visible.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-white/50">No session in this period.</p>
              ) : (
                <ul className="max-h-[640px] divide-y divide-white/5 overflow-auto">
                  {visible.map((activity) => {
                    const active = activity.id === selectedId
                    return (
                      <li key={activity.id}>
                        <button
                          type="button"
                          onClick={() => selectActivity(activity.id)}
                          className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left ${active ? 'bg-sky-400/10' : 'hover:bg-white/[0.03]'}`}
                        >
                          <span>
                            <span className="block text-sm font-medium">{activity.name}</span>
                            <span className="mt-1 flex items-center gap-2 text-xs text-white/50">
                              <SportIcon sport={activity.sport} className="h-3.5 w-3.5" />
                              {SPORT_LABEL[activity.sport]} · {formatWhen(activity.date)}
                            </span>
                          </span>
                          <span className="text-right text-xs text-white/70">
                            <span className="block">{formatDistance(activity.distanceM)}</span>
                            <span className="text-white/45">{formatDuration(activity.movingSec)}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
            <div className="flex flex-col gap-4">
              <ActivityMap activities={visible} maxHr={maxHr} split={split} selectedId={selected?.id ?? null} onSelect={selectActivity} />
              {selected ? (
                <ActivityDetail activity={selected} peers={sportFiltered} onOpen={() => setDetailId(selected.id)} />
              ) : (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/45">
                  Click a session in the list or on the map.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function ActivityDetail({ activity, peers, onOpen }: { activity: Activity; peers: Activity[]; onOpen: () => void }) {
  const when = new Date(activity.date)
  const week = weekWindow(when)
  const bounds = windowBounds(week)
  const inWeek = peers
    .filter((item) => {
      const time = new Date(item.date).getTime()
      return time >= bounds.start && time <= bounds.end
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id.localeCompare(b.id))
  const index = Math.max(1, inWeek.findIndex((item) => item.id === activity.id) + 1)
  const weekKm = inWeek.reduce((sum, item) => sum + item.distanceM, 0)
  const share = weekKm > 0 ? Math.round((activity.distanceM / weekKm) * 100) : 0
  const stamp = Number.isNaN(when.getTime())
    ? activity.date
    : `${when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${when.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">
        <SportIcon sport={activity.sport} className="h-3.5 w-3.5" />
        {SPORT_LABEL[activity.sport]}
      </p>
      <h2 className="mt-1 font-display text-xl font-semibold">{activity.name}</h2>
      <p className="mt-1 text-sm text-white/55">
        {activity.type} · {stamp}
        {activity.track.length < 2 ? ' · no GPS track' : ''}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Distance" value={formatDistance(activity.distanceM)} />
        <Stat label="Time" value={formatDuration(activity.movingSec)} />
        <Stat label={activity.sport === 'ride' ? 'Avg. speed' : 'Avg. pace'} value={formatPaceOrSpeed(activity)} />
        <Stat label="Elevation" value={`${Math.round(activity.elevationM)} m`} />
        <Stat label="Avg. HR" value={activity.avgHr === null ? '—' : `${Math.round(activity.avgHr)} bpm`} />
      </dl>
      <p className="mt-4 text-sm text-white/70">
        In the week: session {index} of {inWeek.length || 1} · {share} % of the volume
        <span className="text-white/40"> · {formatWindow(week)}</span>
      </p>
      <button type="button" onClick={onOpen} className="mt-4 w-full rounded-md bg-sky-400 px-3 py-2 text-sm font-medium text-slate-950">
        See details
      </button>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-white/40">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

