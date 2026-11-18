import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/** True when the chart is rotated 90° clockwise to read as landscape on a portrait phone. */
export const ChartRotated = createContext(false)

export function useChartRotated(): boolean {
  return useContext(ChartRotated)
}

/**
 * Local x inside a chart box. A 90° clockwise rotation maps the chart's x axis onto the screen's vertical axis.
 * lx = width/2 − (clientY − visualCenterY).
 */
export function chartLocalX(el: HTMLElement, clientX: number, clientY: number, rotated: boolean): number {
  if (!rotated) return clientX - el.getBoundingClientRect().left
  const rect = el.getBoundingClientRect()
  return el.offsetWidth / 2 - (clientY - (rect.top + rect.height / 2))
}

/** On phones, a button opens the chart fullscreen, rotated to landscape while the phone stays portrait. */
export function ChartFrame({ label, children }: { label: string; children: (full: boolean) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="relative">
        <div className={open ? 'invisible' : undefined}>{children(false)}</div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Show ${label} fullscreen`}
          className="absolute bottom-1 right-1 z-10 grid h-9 w-9 place-items-center rounded-md bg-black/70 text-white/80 lg:hidden"
        >
          <Expand />
        </button>
      </div>
      {open ? (
        <ChartStage label={label} onClose={() => setOpen(false)}>
          {() => children(true)}
        </ChartStage>
      ) : null}
    </>
  )
}

function ChartStage({ label, onClose, children }: { label: string; onClose: () => void; children: () => ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [portrait, setPortrait] = useState(true)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const query = window.matchMedia('(orientation: portrait)')
    const sync = () => setPortrait(query.matches)
    sync()
    query.addEventListener('change', sync)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      query.removeEventListener('change', sync)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 truncate pr-14 text-xs text-white/55">{label}</p>
      <div className="min-h-0 flex-1">{children()}</div>
    </div>
  )

  return (
    <div ref={frameRef} role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 bg-[#05060a]">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 rounded-md bg-white/10 px-3 py-2 text-sm text-white"
      >
        Close
      </button>
      {portrait && box.w > 0 ? (
        <ChartRotated.Provider value={true}>
          <div className="absolute left-1/2 top-1/2 p-2" style={{ width: box.h, height: box.w, transform: 'translate(-50%, -50%) rotate(90deg)' }}>
            {body}
          </div>
        </ChartRotated.Provider>
      ) : null}
      {!portrait ? <div className="h-full px-3 pb-3 pt-14">{body}</div> : null}
    </div>
  )
}

function Expand() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10" />
    </svg>
  )
}
