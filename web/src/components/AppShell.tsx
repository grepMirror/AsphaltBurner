import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { label: 'Matrix', to: '/matrix', icon: '☆' },
  { label: 'Pacing', to: null, icon: '▤' },
  { label: 'Activities', to: null, icon: '∿' },
]

export function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <NavLink to="/matrix" className="flex items-center gap-2 font-display text-sm font-semibold tracking-[0.16em]">
            <Mark />
            ENDURAW
          </NavLink>
          <nav aria-label="Navigation principale" className="flex items-center gap-1">
            {links.map((link) =>
              link.to ? (
                <NavLink
                  key={link.label}
                  to={link.to}
                  className={({ isActive }) =>
                    `relative px-3 py-4 text-sm ${isActive ? 'text-sky-300' : 'text-white/70'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="mr-1.5 text-xs">{link.icon}</span>
                      {link.label}
                      {isActive ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-sky-300" /> : null}
                    </>
                  )}
                </NavLink>
              ) : (
                <span key={link.label} className="px-3 py-4 text-sm text-white/45">
                  <span className="mr-1.5 text-xs">{link.icon}</span>
                  {link.label}
                </span>
              ),
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <Outlet />
      </main>
      <button
        type="button"
        className="fixed bottom-5 left-5 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-sm text-white/80"
      >
        Guide
      </button>
    </div>
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
