import { useEffect, useRef, useState } from 'react'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { CalendarPage } from './pages/CalendarPage'
import { LoadPage } from './pages/LoadPage'
import { DEFAULT_MAX_HR, loadMaxHr, saveMaxHr } from './lib/intensity'

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

  const updateMaxHr = (value: number) => setMaxHr(saveMaxHr(value))

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <div className="flex items-center gap-2 font-display text-sm font-semibold tracking-[0.16em]">
            <Mark />
            ENDURAW
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
          <HrSettings maxHr={maxHr} onChange={updateMaxHr} />
        </div>
      </header>
      {path === '/' ? (
        <main>
          <CalendarPage maxHr={maxHr} />
        </main>
      ) : null}
      {path === '/load' ? (
        <main>
          <LoadPage maxHr={maxHr} />
        </main>
      ) : null}
      {path === '/activities' ? (
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
          <ActivitiesPage maxHr={maxHr} />
        </main>
      ) : null}
    </div>
  )
}

function HrSettings({ maxHr, onChange }: { maxHr: number; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(maxHr))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft(String(maxHr))
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
  }, [open, maxHr])

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

  const mediumFrom = Math.ceil(maxHr * 0.7)
  const hardFrom = Math.ceil(maxHr * 0.8)

  return (
    <div ref={rootRef} className="relative ml-auto">
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
        <div role="dialog" aria-label="Heart rate zones" className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-[#262C3B] bg-[#12161E] p-4 shadow-xl">
          <p className="text-sm font-semibold">Max heart rate</p>
          <p className="mt-1 text-xs text-white/45">Zones use this value. Default {DEFAULT_MAX_HR} bpm.</p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="number"
              min={100}
              max={230}
              inputMode="numeric"
              value={draft}
              onChange={(event) => apply(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              className="w-24 rounded-lg border border-[#262C3B] bg-[#0B0D12] px-3 py-2 text-base font-semibold tabular-nums outline-none focus:border-white/40"
            />
            <span className="text-white/55">bpm</span>
          </label>
          <ul className="mt-3 space-y-1.5 text-xs text-white/70">
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#1F6F8B' }} />
              Easy under {mediumFrom} bpm
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#FACC15' }} />
              Medium {mediumFrom}–{hardFrom - 1} bpm
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#DC2626' }} />
              Hard {hardFrom} bpm and above
            </li>
          </ul>
        </div>
      ) : null}
    </div>
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
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M4 14c2-6 4-9 7-9s5 3 7 9" fill="none" stroke="white" strokeWidth="1.6" />
      <path d="M7 14c1.2-3 2.2-4.5 4-4.5S13.8 11 15 14" fill="none" stroke="white" strokeWidth="1.6" />
    </svg>
  )
}
