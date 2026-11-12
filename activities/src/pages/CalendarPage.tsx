import { useEffect, useMemo, useState } from 'react'
import { MonthCalendar } from '../components/MonthCalendar'
import { SessionView } from '../components/SessionView'
import { SportIcon } from '../components/SportIcon'
import { buildMonthCalendar, monthOfLatest, type DayCell } from '../lib/calendar'
import { SPORT_LABEL, formatDistance, formatDuration, formatPaceOrSpeed } from '../lib/format'
import { loadBundle } from '../lib/store'
import type { Activity, Sport } from '../types'

export function CalendarPage({ maxHr }: { maxHr: number }) {
  const [ready, setReady] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [sports, setSports] = useState<Set<Sport>>(() => new Set(['run']))

  useEffect(() => {
    let cancelled = false
    loadBundle()
      .then((bundle) => {
        if (cancelled || !bundle) return
        const next = bundle.activities.map((activity) => ({ ...activity, stream: activity.stream ?? [] }))
        setActivities(next)
        const runs = next.filter((activity) => activity.sport === 'run')
        const latest = monthOfLatest(runs.length > 0 ? runs : next)
        if (latest) setCursor(latest)
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

  const visible = useMemo(() => activities.filter((activity) => sports.has(activity.sport)), [activities, sports])
  const model = useMemo(() => buildMonthCalendar(visible, cursor.year, cursor.month, maxHr), [visible, cursor.year, cursor.month, maxHr])
  const selectedDay = model.weeks.flatMap((week) => week.days).find((day) => day.key === selectedKey) ?? null
  const detail = activities.find((activity) => activity.id === detailId) ?? null

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const date = new Date(current.year, current.month + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
    setSelectedKey(null)
  }

  const toggleSport = (sport: Sport) => {
    setSports((current) => {
      const next = new Set(current)
      if (next.has(sport)) {
        if (next.size === 1) return current
        next.delete(sport)
      } else {
        next.add(sport)
      }
      return next
    })
    setSelectedKey(null)
  }

  if (!ready) {
    return <p className="calendar-page px-10 py-10 text-sm text-[#9AA3B5]">Loading saved sessions…</p>
  }

  if (detail) {
    return (
      <div className="calendar-page min-h-[calc(100vh-3.5rem)] px-6 py-8">
        <div className="mx-auto max-w-[1280px]">
          <SessionView activity={detail} maxHr={maxHr} backLabel="← Back to calendar" onBack={() => setDetailId(null)} />
        </div>
      </div>
    )
  }

  return (
    <div className="calendar-page min-h-[calc(100vh-3.5rem)] px-10 pb-14 pt-10">
      <MonthCalendar
        model={model}
        sports={sports}
        onToggleSport={toggleSport}
        selectedKey={selectedKey}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
        onToday={() => {
          const now = new Date()
          setCursor({ year: now.getFullYear(), month: now.getMonth() })
          setSelectedKey(null)
        }}
        onSelectDay={(day) => setSelectedKey((current) => (current === day.key ? null : day.key))}
      />
      <div className="mx-auto mt-4 flex w-full max-w-[1280px] flex-col gap-4">
        {error ? <p className="rounded-xl border border-[#5c2b2e] bg-[#2a1215] px-3 py-2 text-sm text-[#ff8a80]">{error}</p> : null}
        {activities.length === 0 ? (
          <p className="text-sm text-[#9AA3B5]">No sessions yet. Import a Strava zip from Activities.</p>
        ) : null}
        {selectedDay && selectedDay.sessions.length > 0 ? <DaySessions day={selectedDay} onOpen={setDetailId} /> : null}
        <p className="text-xs text-[#8A93A6]">Weeks run Monday to Sunday. Week totals include days from neighbouring months. Month totals do not.</p>
      </div>
    </div>
  )
}

function DaySessions({ day, onOpen }: { day: DayCell; onOpen: (id: string) => void }) {
  const when = new Date(`${day.key}T12:00:00`)
  const title = when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <section className="rounded-[22px] border border-[#1E2330] bg-[#10131A] p-[22px]">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <ul className="mt-4 divide-y divide-[#1E2330]">
        {day.sessions.map((activity) => {
          const stamp = new Date(activity.date)
          const time = Number.isNaN(stamp.getTime()) ? '' : stamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          return (
            <li key={activity.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold">{activity.name}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-[#9AA3B5]">
                  <SportIcon sport={activity.sport} className="h-3.5 w-3.5" />
                  {SPORT_LABEL[activity.sport]}
                  {time ? ` · ${time}` : ''}
                  {activity.track.length < 2 ? ' · no GPS track' : ''}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-right text-xs text-[#C5CAD3]">
                  <span className="cal-num block text-sm font-semibold text-[#E8EAF0]">{formatDistance(activity.distanceM)}</span>
                  <span>
                    {formatDuration(activity.movingSec)} · {formatPaceOrSpeed(activity)} · {Math.round(activity.elevationM)} m
                  </span>
                </p>
                <button type="button" onClick={() => onOpen(activity.id)} className="rounded-xl bg-[#E8EAF0] px-3 py-2 text-sm font-semibold text-[#0B0D12]">
                  Details
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
