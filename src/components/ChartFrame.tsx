import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Pointer position in the chart SVG's own pixels, including a CSS rotation on an ancestor. */
export function svgLocalPoint(el: HTMLElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const svg = el.querySelector('svg')
  const ctm = svg?.getScreenCTM()
  if (!svg || !ctm) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
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
        <RotatedChart width={box.h} height={box.w}>
          {body}
        </RotatedChart>
      ) : null}
      {!portrait ? <div className="h-full px-3 pb-3 pt-14">{body}</div> : null}
    </div>
  )
}

/**
 * Recharts maps a finger with getBoundingClientRect, which ignores rotate(90deg).
 * While a touch is on the chart, report a rect that puts that finger on the chart's own x axis.
 * ponytail: one rect, first finger only. Pinch uses real screen points.
 */
function RotatedChart({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    let mapping: { wrap: HTMLElement; left: number; top: number; width: number; height: number } | null = null
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (mapping && this === mapping.wrap) return new DOMRect(mapping.left, mapping.top, mapping.width, mapping.height)
      const rect = original.call(this)
      if (!root.contains(this)) return rect
      const layoutWidth = this.offsetWidth
      const layoutHeight = this.offsetHeight
      if (layoutWidth <= 0 || layoutHeight <= 0) return rect
      if (Math.abs(rect.width - layoutWidth) < 1 && Math.abs(rect.height - layoutHeight) < 1) return rect
      return new DOMRect(rect.left, rect.top, layoutWidth, layoutHeight)
    }
    const arm = (event: Event) => {
      mapping = null
      const point = event instanceof TouchEvent ? event.touches[0] : event instanceof MouseEvent ? event : null
      if (!point) return
      const hit = event.target
      if (!(hit instanceof Element)) return
      const wrap = hit.closest('.recharts-wrapper')
      if (!(wrap instanceof HTMLElement)) return
      const svg = wrap.querySelector('svg')
      const ctm = svg?.getScreenCTM()
      if (!svg || !ctm) return
      const local = svg.createSVGPoint()
      local.x = point.clientX
      local.y = point.clientY
      const mapped = local.matrixTransform(ctm.inverse())
      mapping = {
        wrap,
        left: point.clientX - mapped.x,
        top: point.clientY - mapped.y,
        width: wrap.offsetWidth,
        height: wrap.offsetHeight,
      }
    }
    const disarm = () => {
      mapping = null
    }
    const types = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup'] as const
    for (const type of types) {
      root.addEventListener(type, arm, true)
      window.addEventListener(type, disarm, { passive: true })
    }
    return () => {
      HTMLElement.prototype.getBoundingClientRect = original
      for (const type of types) {
        root.removeEventListener(type, arm, true)
        window.removeEventListener(type, disarm)
      }
    }
  }, [width, height])
  return (
    <div ref={ref} className="absolute left-1/2 top-1/2 p-2" style={{ width, height, transform: 'translate(-50%, -50%) rotate(90deg)' }}>
      {children}
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
