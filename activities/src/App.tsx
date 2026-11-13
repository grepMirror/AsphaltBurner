import { useEffect, useRef, useState } from 'react'
import { ActivitiesProvider, useActivities } from './lib/activities'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { CalendarPage } from './pages/CalendarPage'
import { LoadPage } from './pages/LoadPage'
import { DEFAULT_MAX_HR, DEFAULT_ZONES, loadMaxHr, loadZones, saveMaxHr, saveZones, type ZoneEdges } from './lib/intensity'

type PagePath = '/' | '/load' | '/activities'

const siteBase = import.meta.env.BASE_URL.replace(/\/$/, '')

function pageUrl(href: PagePath): string {
  return `${siteBase}${href}`
}

function currentPath(): PagePath {
  let path = window.location.pathname
  if (siteBase && path.startsWith(siteBase)) path = path.slice(siteBase.length)
  path = path.replace(/\/+$/, '') || '/'
  if (path === '/load') return '/load'
  if (path === '/activities') return '/activities'
  return '/'
}

export function App() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onPop = () => setPath(currentPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (href: PagePath) => {
    if (href === path) return
    window.history.pushState({}, '', pageUrl(href))
    setPath(href)
  }

  const [maxHr, setMaxHr] = useState(loadMaxHr)
  const [zones, setZones] = useState<ZoneEdges>(loadZones)

  const updateMaxHr = (value: number) => setMaxHr(saveMaxHr(value))
  const updateZones = (values: number[]) => {
    const next = saveZones(values)
    setZones(next)
    return next
  }

  return (
    <ActivitiesProvider>
      <Shell path={path} go={go} maxHr={maxHr} onMaxHr={updateMaxHr} zones={zones} onZones={updateZones} />
    </ActivitiesProvider>
  )
}

function Shell({
  path,
  go,
  maxHr,
  onMaxHr,
  zones,
  onZones,
}: {
  path: PagePath
  go: (href: PagePath) => void
  maxHr: number
  onMaxHr: (value: number) => void
  zones: ZoneEdges
  onZones: (values: number[]) => ZoneEdges
}) {
  const { progress, error } = useActivities()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-[0.16em]">
            <Mark />
            AsphaltBurner
          </div>
          <nav aria-label="Main" className="flex items-center">
            <NavItem href="/" active={path === '/'} onNavigate={go}>
              Calendar
            </NavItem>
            <NavItem href="/load" active={path === '/load'} onNavigate={go}>
              Load
            </NavItem>
            <NavItem href="/activities" active={path === '/activities'} onNavigate={go}>
              Activities
            </NavItem>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ImportZip />
            <HrSettings maxHr={maxHr} onChange={onMaxHr} zones={zones} onZones={onZones} />
          </div>
        </div>
      </header>
      {error ? <p className="mx-auto max-w-6xl px-4 pt-4 text-sm text-red-200">{error}</p> : null}
      {progress ? (
        <p className="mx-auto max-w-6xl px-4 pt-4 text-sm text-white/70">
          Reading {progress.done}/{progress.total}
          {progress.label ? ` · ${progress.label}` : ''}
        </p>
      ) : null}
      {path === '/' ? (
        <main>
          <CalendarPage maxHr={maxHr} split={zones} />
        </main>
      ) : null}
      {path === '/load' ? (
        <main>
          <LoadPage maxHr={maxHr} split={zones} />
        </main>
      ) : null}
      {path === '/activities' ? (
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
          <ActivitiesPage maxHr={maxHr} split={zones} />
        </main>
      ) : null}
    </div>
  )
}

function ImportZip() {
  const { importFile, progress } = useActivities()

  return (
    <label className="cursor-pointer rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
      {progress ? 'Importing…' : 'Import zip'}
      <input
        className="sr-only"
        type="file"
        accept=".zip,application/zip"
        disabled={progress !== null}
        onChange={(event) => {
          importFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </label>
  )
}

function HrSettings({
  maxHr,
  onChange,
  zones,
  onZones,
}: {
  maxHr: number
  onChange: (value: number) => void
  zones: ZoneEdges
  onZones: (values: number[]) => ZoneEdges
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(maxHr))
  const [zoneDraft, setZoneDraft] = useState(() => zones.map(String))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft(String(maxHr))
    setZoneDraft(zones.map(String))
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
  }, [open, maxHr, zones])

  const apply = (raw: string) => {
    setDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 100 || parsed > 230) return
    onChange(parsed)
  }

  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(String(maxHr))
      return
    }
    onChange(parsed)
    setDraft(String(Math.min(230, Math.max(100, Math.round(parsed)))))
  }

  const commitZones = () => {
    const next = onZones(zoneDraft.map(Number))
    setZoneDraft(next.map(String))
  }

  const parsed = zoneDraft.map(Number)
  const shown = parsed.every((value) => Number.isFinite(value)) ? parsed : zones
  const bpm = shown.map((value) => Math.ceil((maxHr * value) / 100))

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`grid h-9 w-9 place-items-center rounded-lg border ${open ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-white/70 hover:text-white'}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Heart rate settings, max ${maxHr} bpm`}
        onClick={() => setOpen((current) => !current)}
      >
        <Gear />
      </button>
      {open ? (
        <div role="dialog" aria-label="Heart rate zones" className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-white/10 bg-[#12161E] p-4 shadow-xl">
          <p className="text-sm font-medium">Max heart rate</p>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="number"
              min={100}
              max={230}
              inputMode="numeric"
              value={draft}
              onChange={(event) => apply(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="w-20 rounded-md border border-white/15 bg-black px-2 py-1 text-sm tabular-nums outline-none focus:border-white/40"
            />
            <span className="text-xs text-white/55">bpm · default {DEFAULT_MAX_HR}</span>
          </label>

          <p className="mt-4 text-sm font-medium">Five zones</p>
          <p className="mt-1 text-xs leading-relaxed text-white/45">
            Each sample is a percent of max heart rate. Z1 is under the first value, each next zone runs up to the next value, and Z5 is the rest. Easy is Z1–Z2, medium is Z3, hard is Z4–Z5. Defaults are {DEFAULT_ZONES.join(', ')}.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {zoneDraft.map((value, index) => (
              <PercentField
                key={DEFAULT_ZONES[index]}
                label={`Z${index + 1} under`}
                value={value}
                onChange={(next) => setZoneDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)))}
                onCommit={commitZones}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-white/70">
            <li>Z1 under {bpm[0]} bpm · easy</li>
            <li>Z2 {bpm[0]}–{Math.max(bpm[0], bpm[1] - 1)} bpm · easy</li>
            <li>Z3 {bpm[1]}–{Math.max(bpm[1], bpm[2] - 1)} bpm · medium</li>
            <li>Z4 {bpm[2]}–{Math.max(bpm[2], bpm[3] - 1)} bpm · hard</li>
            <li>Z5 {bpm[3]} bpm and above · hard</li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function PercentField({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (value: string) => void; onCommit: () => void }) {
  return (
    <label className="text-xs text-white/55">
      {label}
      <span className="mt-1 flex items-center gap-1">
        <input
          type="number"
          min={40}
          max={99}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="w-full rounded-md border border-white/15 bg-black px-2 py-1 text-sm tabular-nums text-white outline-none focus:border-white/40"
        />
        <span>%</span>
      </span>
    </label>
  )
}

function Gear() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="2.2" />
      <path d="M9 1.8v1.7M9 14.5v1.7M1.8 9h1.7M14.5 9h1.7M3.7 3.7l1.2 1.2M13.1 13.1l1.2 1.2M14.3 3.7l-1.2 1.2M4.9 13.1l-1.2 1.2" />
    </svg>
  )
}

function NavItem({
  href,
  active,
  onNavigate,
  children,
}: {
  href: PagePath
  active: boolean
  onNavigate: (href: PagePath) => void
  children: string
}) {
  return (
    <a
      href={pageUrl(href)}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        onNavigate(href)
      }}
      className={`relative px-3 py-4 text-sm ${active ? 'text-sky-300' : 'text-white/70'}`}
    >
      {children}
      {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-sky-300" /> : null}
    </a>
  )
}

function Mark() {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white">
      <img
        src={`${import.meta.env.BASE_URL}icons/icon_asphaltbuner.svg`}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7"
      />
    </span>
  )
}
