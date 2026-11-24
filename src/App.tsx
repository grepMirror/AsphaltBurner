import { useEffect, useState } from 'react'
import { ProfileModal } from './components/ProfileModal'
import { ActivitiesProvider, useActivities } from './lib/activities'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { CalendarPage } from './pages/CalendarPage'
import { LoadPage } from './pages/LoadPage'
import { PlannerPage } from './pages/PlannerPage'
import { ProfilePage } from './pages/ProfilePage'
import { activeProfile, addProfile, loadProfiles, removeProfile, renameProfile, saveProfiles, selectProfile, updateHr, type ProfileBook } from './lib/profiles'

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

  const [book, setBook] = useState(loadProfiles)
  const changeBook = (next: ProfileBook) => setBook(saveProfiles(next))

  return (
    <ActivitiesProvider profileId={book.activeId} profileIds={book.profiles.map((profile) => profile.id)}>
      <Shell path={path} go={go} book={book} onBook={changeBook} />
    </ActivitiesProvider>
  )
}

function Shell({ path, go, book, onBook }: { path: PagePath; go: (href: PagePath) => void; book: ProfileBook; onBook: (book: ProfileBook) => void }) {
  const { progress, error, forgetProfile } = useActivities()
  const [profileOpen, setProfileOpen] = useState(false)
  const profile = activeProfile(book)
  const { maxHr, restHr, method, zones } = profile

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
            <ProfileButton name={profile.name} onOpen={() => setProfileOpen(true)} />
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
      {profileOpen ? (
        <ProfileModal
          book={book}
          onSelect={(id) => onBook(selectProfile(book, id))}
          onCreate={() => onBook(addProfile(book).book)}
          onRename={(id, name) => onBook(renameProfile(book, id, name))}
          onHr={(id, patch) => onBook(updateHr(book, id, patch))}
          onDelete={(id) => {
            void forgetProfile(id)
            onBook(removeProfile(book, id))
          }}
          onClose={() => setProfileOpen(false)}
        />
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

/** Header button showing who is active. It opens the profile popup. */
function ProfileButton({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`Profile: ${name}`}
      title={name}
      onClick={onOpen}
      className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-2.5 text-white/70 hover:border-white/30 hover:text-white"
    >
      <ProfileIcon />
      <span className="hidden max-w-[7rem] truncate text-sm sm:block">{name}</span>
    </button>
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
