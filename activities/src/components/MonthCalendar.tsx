import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SportIcon } from './SportIcon'
import type { DayCell, MonthCalendar as MonthModel } from '../lib/calendar'
import { SPORTS, SPORT_LABEL } from '../lib/format'
import type { Sport } from '../types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type MonthCalendarProps = {
  model: MonthModel
  sports: Set<Sport>
  onToggleSport: (sport: Sport) => void
  selectedKey: string | null
  actions?: ReactNode
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSelectDay: (day: DayCell) => void
}

export function MonthCalendar({ model, sports, onToggleSport, selectedKey, actions, onPrev, onNext, onToday, onSelectDay }: MonthCalendarProps) {
  const [showTotals, setShowTotals] = useState(loadWeekTotals)
  const toggleTotals = () => {
    setShowTotals((current) => {
      const next = !current
      saveWeekTotals(next)
      return next
    })
  }
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="font-display text-[44px] font-semibold leading-none tracking-tight">{model.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <button type="button" className="cal-btn grid h-11 w-11 place-items-center rounded-xl border border-[#262C3B] bg-[#12161E] p-0 text-[#E8EAF0]" onClick={onPrev} aria-label="Previous month">
            <Chevron direction="left" />
          </button>
          <button type="button" className="cal-btn h-11 rounded-xl border border-[#262C3B] bg-[#12161E] px-5 text-sm font-semibold text-[#E8EAF0]" onClick={onToday}>
            Today
          </button>
          <button type="button" className="cal-btn grid h-11 w-11 place-items-center rounded-xl border border-[#262C3B] bg-[#12161E] p-0 text-[#E8EAF0]" onClick={onNext} aria-label="Next month">
            <Chevron direction="right" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3.5">
        {model.tiles.map((tile) => (
          <div key={tile.label} className="flex min-w-[220px] flex-1 flex-col gap-2 rounded-2xl border border-[#1E2330] bg-[#12161E] px-5 py-[18px]">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-[#9AA3B5]">{tile.label}</span>
            <div className="flex items-baseline gap-1.5">
              <span className="cal-num text-[34px] font-semibold leading-none tracking-tight tabular-nums">{tile.value}</span>
              {tile.unit ? <span className="text-sm font-medium text-[#9AA3B5]">{tile.unit}</span> : null}
            </div>
            <span className="text-[13px] text-[#9AA3B5]">{tile.sub}</span>
          </div>
        ))}
      </div>

      <div className={`cal-board cal-pad flex flex-col gap-[18px] rounded-[22px] border border-[#1E2330] bg-[#10131A] p-[22px] ${showTotals ? '' : 'is-totals-hidden'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2">
          {model.legend.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-[13px]">
              <span className="flex h-5 w-[30px] items-end justify-center gap-0.5 rounded-md pb-1" style={{ background: item.bg, color: item.fg }}>
                <span className="h-[5px] w-1 rounded-[1px] bg-current" style={{ opacity: item.bars[0] }} />
                <span className="h-2 w-1 rounded-[1px] bg-current" style={{ opacity: item.bars[1] }} />
                <span className="h-[11px] w-1 rounded-[1px] bg-current" style={{ opacity: item.bars[2] }} />
              </span>
              <span className="font-semibold">{item.name}</span>
              <span className="text-[#9AA3B5]">{item.days === 1 ? '1 day' : `${item.days} days`}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-[13px]">
            <span className="h-5 w-[30px] rounded-md border border-[#262C3B] bg-[#171B24]" />
            <span className="font-semibold">Rest</span>
            <span className="text-[#9AA3B5]">{model.restDays === 1 ? '1 day' : `${model.restDays} days`}</span>
          </div>
        </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={showTotals}
              onClick={toggleTotals}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${showTotals ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5 text-white/55'}`}
            >
              Week totals
            </button>
            <SportFilter sports={sports} onToggle={onToggleSport} />
          </div>
        </div>

        <div className="cal-weekhead">
          <div className="cal-days">
            {WEEKDAYS.map((day) => (
              <span key={day} className="pl-1 text-xs font-medium uppercase tracking-[0.06em] text-[#9AA3B5]">
                {day}
              </span>
            ))}
          </div>
          {showTotals ? <span /> : null}
        </div>

        <div className="flex flex-col gap-2.5">
          {model.weeks.map((week) => (
            <div key={week.id} className="cal-week">
              <div className="cal-days">
                {week.days.map((day) => (
                  <DayCellView key={day.key} day={day} selected={day.key === selectedKey} onSelect={() => onSelectDay(day)} />
                ))}
              </div>
              {showTotals ? <div className="flex flex-col justify-center gap-3 rounded-[14px] border bg-[#12161E] px-4 py-3.5" style={{ borderColor: week.border }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">{week.label}</span>
                    {week.isCurrent ? <span className="rounded-full bg-[#E8EAF0] px-2 py-0.5 text-[11px] font-semibold text-[#0B0D12]">This week</span> : null}
                  </div>
                  <span className="text-xs text-[#9AA3B5]">{week.range}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {week.metrics.map((metric) => (
                    <div key={metric.label} className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-baseline gap-0.5">
                        <span className="cal-num text-lg font-semibold leading-tight tabular-nums">{metric.value}</span>
                        {metric.unit ? <span className="text-[11px] text-[#9AA3B5]">{metric.unit}</span> : null}
                      </div>
                      <span className="text-[11px] text-[#9AA3B5]">{metric.label}</span>
                    </div>
                  ))}
                </div>
              </div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DayCellView({ day, selected, onSelect }: { day: DayCell; selected: boolean; onSelect: () => void }) {
  const ring = selected ? 'inset 0 0 0 2px #E8EAF0' : day.ring
  const style = { background: day.bg, color: day.fg, boxShadow: ring }
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[13px] font-semibold leading-none">{day.day}</span>
        {day.bars ? (
          <span className="cal-glyph flex h-3 items-end gap-0.5" title="Intensity">
            <span className="h-[5px] w-1 rounded-[1px] bg-current" style={{ opacity: day.bars[0] }} />
            <span className="h-2 w-1 rounded-[1px] bg-current" style={{ opacity: day.bars[1] }} />
            <span className="h-[11px] w-1 rounded-[1px] bg-current" style={{ opacity: day.bars[2] }} />
          </span>
        ) : (
          <span />
        )}
      </div>
      <div className="flex flex-1 items-center justify-center gap-1">
        {day.sports.map((sport) => (
          <SportIcon key={sport} sport={sport} className={day.sports.length > 1 ? 'h-6 w-6' : 'cal-sport h-8 w-8'} />
        ))}
      </div>
      <div className="flex items-end">
        <span className="cal-km">
          {day.km}
          {day.unit ? <small>{day.unit}</small> : null}
        </span>
      </div>
    </>
  )

  if (day.sessions.length === 0) {
    return (
      <div className="cal-cell" title={day.tip} style={style}>
        {body}
      </div>
    )
  }

  return (
    <button type="button" className="cal-cell" title={day.tip} aria-pressed={selected} aria-label={day.tip} onClick={onSelect} style={style}>
      {body}
    </button>
  )
}

function SportFilter({ sports, onToggle }: { sports: Set<Sport>; onToggle: (sport: Sport) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const summary = SPORTS.filter((sport) => sports.has(sport))
    .map((sport) => SPORT_LABEL[sport])
    .join(', ')

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`cal-btn flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${open ? 'border-[#E8EAF0] bg-[#1C2231] text-[#E8EAF0]' : 'border-[#262C3B] bg-[#12161E] text-[#E8EAF0]'}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Filter activities, ${summary}`}
        onClick={() => setOpen((current) => !current)}
      >
        <FilterMark />
        <span className="flex items-center gap-1.5">
          {SPORTS.filter((sport) => sports.has(sport)).map((sport) => (
            <SportIcon key={sport} sport={sport} className="h-4 w-4" />
          ))}
        </span>
      </button>
      {open ? (
        <div role="dialog" aria-label="Activities" className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-[#262C3B] bg-[#12161E] p-2 shadow-xl">
          {SPORTS.map((sport) => {
            const on = sports.has(sport)
            return (
              <button
                key={sport}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(sport)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${on ? 'bg-white/[0.06]' : 'text-[#9AA3B5]'}`}
              >
                <SportIcon sport={sport} className="h-5 w-5" />
                <span className="flex-1 font-semibold">{sport === 'other' ? 'Others' : SPORT_LABEL[sport]}</span>
                <span className={`grid h-5 w-5 place-items-center rounded-md border ${on ? 'border-[#E8EAF0] bg-[#E8EAF0] text-[#0B0D12]' : 'border-[#3A4150]'}`}>
                  {on ? <Check /> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function FilterMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5h12l-4.5 5.2V14l-3 1.2V9.7L3 4.5Z" />
    </svg>
  )
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" />
    </svg>
  )
}

const WEEK_TOTALS_KEY = 'asphaltburner.weekTotals'

function loadWeekTotals(): boolean {
  try {
    return localStorage.getItem(WEEK_TOTALS_KEY) !== '0'
  } catch {
    return true
  }
}

function saveWeekTotals(open: boolean) {
  try {
    localStorage.setItem(WEEK_TOTALS_KEY, open ? '1' : '0')
  } catch {
    /* the choice still applies for this visit */
  }
}

function Chevron({ direction }: { direction: 'left' | 'right' | 'up' | 'down' }) {
  const d =
    direction === 'left'
      ? 'M12.5 4.5 7 10l5.5 5.5'
      : direction === 'up'
        ? 'M4.5 12.5 10 7l5.5 5.5'
        : direction === 'down'
          ? 'M4.5 7.5 10 13l5.5-5.5'
          : 'M7.5 4.5 13 10l-5.5 5.5'
  const size = direction === 'up' || direction === 'down' ? 16 : 20
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
