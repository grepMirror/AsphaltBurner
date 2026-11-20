import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ConnectorsModal } from './components/Connectors'
import { Segment } from './components/Segment'
import { ActivitiesProvider, useActivities } from './lib/activities'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { CalendarPage } from './pages/CalendarPage'
import { LoadPage } from './pages/LoadPage'
import { PlannerPage } from './pages/PlannerPage'
import { ProfilePage } from './pages/ProfilePage'
import { DEFAULT_ZONES, loadHrMethod, loadMaxHr, loadRestHr, loadZones, reserveRest, saveHrMethod, saveMaxHr, saveRestHr, saveZones, zoneCutBpm, type HrMethod, type ZoneEdges } from './lib/intensity'

type PagePath = '/' | '/load' | '/activities' | '/profile' | '/planner'

const PAGES: { href: PagePath; label: string }[] = [
  { href: '/', label: 'Calendar' },
  { href: '/load', label: 'Load' },
  { href: '/planner', label: 'Planner' },
  { href: '/profile', label: 'Profile' },
  { href: '/activities', label: 'Activities' },
]

const siteBase = import.meta.env.BASE_URL.replace(/\/$/, '')

function pageUrl(href: PagePath): string {
  return `${siteBase}${href}`
}

function currentPath(): PagePath {
  let path = window.location.pathname
  if (siteBase && path.startsWith(siteBase)) path = path.slice(siteBase.length)
  path = path.replace(/\/+$/, '') || '/'
  if (path === '/load' || path === '/activities' || path === '/profile' || path === '/planner') return path
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
  const [restHr, setRestHr] = useState(loadRestHr)
  const [method, setMethod] = useState<HrMethod>(loadHrMethod)
  const [zones, setZones] = useState<ZoneEdges>(loadZones)

  const updateMaxHr = (value: number) => setMaxHr(saveMaxHr(value))
  const updateRestHr = (value: number) => setRestHr(saveRestHr(value))
  const updateMethod = (value: HrMethod) => setMethod(saveHrMethod(value))
  const updateZones = (values: number[]) => {
    const next = saveZones(values)
    setZones(next)
    return next
  }

  return (
    <ActivitiesProvider>
      <Shell path={path} go={go} maxHr={maxHr} onMaxHr={updateMaxHr} restHr={restHr} onRestHr={updateRestHr} method={method} onMethod={updateMethod} zones={zones} onZones={updateZones} />
    </ActivitiesProvider>
  )
}

function Shell({
  path,
  go,
  maxHr,
  onMaxHr,
  restHr,
  onRestHr,
  method,
  onMethod,
  zones,
  onZones,
}: {
  path: PagePath
  go: (href: PagePath) => void
  maxHr: number
  onMaxHr: (value: number) => void
  restHr: number
  onRestHr: (value: number) => void
  method: HrMethod
  onMethod: (value: HrMethod) => void
  zones: ZoneEdges
  onZones: (values: number[]) => ZoneEdges
}) {
  const { progress, error } = useActivities()
  const nav = (tab: boolean) =>
    PAGES.map((page) => (
      <NavItem key={page.href} href={page.href} active={path === page.href} onNavigate={go} tab={tab}>
        {page.label}
      </NavItem>
    ))

  return (
    <div className="min-h-screen pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-[0.16em]">
            <Mark />
            AsphaltBurner
          </div>
          <nav aria-label="Main" className="hidden items-center md:flex">
            {nav(false)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ImportZip />
            <ProfileMenu maxHr={maxHr} onChange={onMaxHr} restHr={restHr} onRest={onRestHr} method={method} onMethod={onMethod} zones={zones} onZones={onZones} />
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
          <CalendarPage maxHr={maxHr} restHr={restHr} method={method} split={zones} />
        </main>
      ) : null}
      {path === '/load' ? (
        <main>
          <LoadPage maxHr={maxHr} restHr={restHr} method={method} split={zones} />
        </main>
      ) : null}
      {path === '/activities' ? (
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
          <ActivitiesPage maxHr={maxHr} restHr={restHr} method={method} split={zones} />
        </main>
      ) : null}
      {path === '/profile' ? (
        <main>
          <ProfilePage maxHr={maxHr} restHr={restHr} method={method} zones={zones} />
        </main>
      ) : null}
      {path === '/planner' ? (
        <main>
          <PlannerPage maxHr={maxHr} restHr={restHr} method={method} split={zones} />
        </main>
      ) : null}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-white/10 bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {nav(true)}
      </nav>
    </div>
  )
}

function ImportZip() {
  const { importFile, progress } = useActivities()

  return (
    <label className="cursor-pointer whitespace-nowrap rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
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

const ZONE_COLORS = ['#1F6F8B', '#5EB0C8', '#FACC15', '#FB923C', '#DC2626']

type HrProps = {
  maxHr: number
  onChange: (value: number) => void
  restHr: number
  onRest: (value: number) => void
  method: HrMethod
  onMethod: (value: HrMethod) => void
  zones: ZoneEdges
  onZones: (values: number[]) => ZoneEdges
}

/** Profile icon in the header. Its menu opens the heart-rate panel or the Connectors window. */
function ProfileMenu(props: HrProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hrOpen, setHrOpen] = useState(false)
  const [connectorsOpen, setConnectorsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [menuOpen])

  const closeHr = useCallback(() => setHrOpen(false), [])
  const closeConnectors = useCallback(() => setConnectorsOpen(false), [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`grid h-9 w-9 place-items-center rounded-lg border ${menuOpen ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-white/70 hover:text-white'}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="Profile menu"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <ProfileIcon />
      </button>
      {menuOpen ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-48 rounded-xl border border-white/10 bg-[#12161E] p-1 shadow-xl">
          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5"
            onClick={() => {
              setMenuOpen(false)
              setHrOpen(true)
            }}
          >
            Heart rate
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5"
            onClick={() => {
              setMenuOpen(false)
              setConnectorsOpen(true)
            }}
          >
            Connectors
          </button>
        </div>
      ) : null}
      <HrSettings {...props} open={hrOpen} onClose={closeHr} />
      {/* Portal: the header has backdrop-blur, which would trap a fixed modal inside the 56px bar. */}
      {connectorsOpen ? createPortal(<ConnectorsModal onClose={closeConnectors} />, document.body) : null}
    </div>
  )
}

function HrSettings({
  open,
  onClose,
  maxHr,
  onChange,
  restHr,
  onRest,
  method,
  onMethod,
  zones,
  onZones,
}: HrProps & { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState(String(maxHr))
  const [restDraft, setRestDraft] = useState(String(restHr))
  const [zoneDraft, setZoneDraft] = useState(() => zones.map(String))
  const rootRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    setDraft(String(maxHr))
    setRestDraft(String(restHr))
    setZoneDraft(zones.map(String))
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onCloseRef.current()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, maxHr, restHr, zones])

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

  const applyRest = (raw: string) => {
    setRestDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 30 || parsed > 100) return
    onRest(parsed)
  }

  const commitRest = () => {
    const parsed = Number(restDraft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRestDraft(String(restHr))
      return
    }
    onRest(parsed)
    setRestDraft(String(Math.min(100, Math.max(30, Math.round(parsed)))))
  }

  const commitZones = () => {
    const next = onZones(zoneDraft.map(Number))
    setZoneDraft(next.map(String))
  }

  const parsed = zoneDraft.map(Number)
  const shown = (parsed.every((value) => Number.isFinite(value)) ? parsed : [...zones]) as unknown as ZoneEdges
  const cuts = zoneCutBpm(maxHr, shown, { restHr, method }).map((value: number) => Math.round(value))
  const floor = method === 'karvonen' ? Math.round(reserveRest(maxHr, restHr)) : 0
  const edges = [floor, ...cuts, maxHr]

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div role="dialog" aria-label="Heart rate zones" className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#12161E] p-3 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-white/55">Intensity Zone :</span>
            <Segment
              label="Intensity"
              value={method}
              options={[
                { id: 'max', label: '% max' },
                { id: 'karvonen', label: 'FCR' },
              ]}
              onChange={onMethod}
            />
            {method === 'karvonen' ? <KarvonenNote /> : null}
          </div>
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
                  className="w-full rounded-md border border-white/15 bg-black px-1 py-1 text-center text-sm tabular-nums text-white outline-none focus:border-white/40"
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
      ) : null}
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
    <label title={hint} className="group relative flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
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

function KarvonenNote() {
  return (
    <details className="relative">
      <summary aria-label="Karvonen method" className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-white/50 ring-1 ring-inset ring-white/25 marker:content-none [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="8" cy="4.6" r="0.75" fill="currentColor" />
        </svg>
      </summary>
      <div className="absolute right-0 top-7 z-20 w-72 max-w-[calc(100vw-2.5rem)] rounded-lg border border-white/15 bg-[#0b0e14] p-3 text-left text-xs leading-relaxed text-white/70 shadow-lg">
        <p className="font-medium text-white/85">Target HR = resting HR + % × (max HR − resting HR)</p>
        <ul className="mt-2 space-y-1.5">
          <li>Zones are personal. Two runners with the same max but different resting rates (45 versus 70) do not share the same zones. Percent of max would give them the same thresholds.</li>
          <li>It tracks real effort more closely. A percent of heart-rate reserve is close to a percent of VO2 reserve.</li>
          <li>Resting heart rate changes over time, so comparing a long period is unreliable.</li>
        </ul>
      </div>
    </details>
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

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="7" r="2.8" />
      <path d="M4.5 16.8c.9-2.9 3-4.2 5.5-4.2s4.6 1.3 5.5 4.2" />
    </svg>
  )
}

function NavItem({
  href,
  active,
  onNavigate,
  tab,
  children,
}: {
  href: PagePath
  active: boolean
  onNavigate: (href: PagePath) => void
  tab: boolean
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
      className={`relative ${tab ? 'flex h-14 flex-col items-center justify-center gap-1 px-0.5 text-[10px] leading-none' : 'px-3 py-4 text-sm'} ${active ? 'text-sky-300' : 'text-white/70'}`}
    >
      {tab ? <NavIcon href={href} /> : null}
      {children}
      {active ? <span className={`absolute h-0.5 bg-sky-300 ${tab ? 'inset-x-2 top-0' : 'inset-x-3 bottom-0'}`} /> : null}
    </a>
  )
}

function NavIcon({ href }: { href: PagePath }) {
  const props = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  if (href === '/') {
    return (
      <svg {...props}>
        <rect x="3.5" y="4" width="13" height="12.5" rx="2" />
        <path d="M3.5 8h13M7.5 4V2.8M12.5 4V2.8" />
      </svg>
    )
  }
  if (href === '/load') {
    return (
      <svg {...props}>
        <path d="M3 14.5 7.2 10l2.4 2.4L17 5" />
        <path d="M13 5h4v4" />
      </svg>
    )
  }
  if (href === '/profile') {
    return (
      <svg {...props}>
        <circle cx="10" cy="7" r="2.4" />
        <path d="M4.8 16.2c.8-2.6 2.7-3.7 5.2-3.7s4.4 1.1 5.2 3.7" />
      </svg>
    )
  }
  if (href === '/planner') {
    return (
      <svg {...props}>
        <rect x="3.5" y="4" width="13" height="12.5" rx="2" />
        <path d="M3.5 8h13M7 11.2h2.2M10.8 11.2H13" />
      </svg>
    )
  }
  return (
    <svg {...props}>
      <path d="M4 6.5h12M4 10h12M4 13.5h8" />
    </svg>
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
