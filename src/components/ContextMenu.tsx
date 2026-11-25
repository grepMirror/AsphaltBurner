import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem = { label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void }

const WIDTH = 224

/** Where to open a menu for an event on `target`. From the keyboard the event has no position, so use the target's lower right corner. */
export function menuPoint(event: { clientX: number; clientY: number }, target: Element): { x: number; y: number } {
  if (event.clientX !== 0 || event.clientY !== 0) return { x: event.clientX, y: event.clientY }
  const box = target.getBoundingClientRect()
  return { x: box.right, y: box.bottom }
}

/**
 * A small menu placed against the screen. Escape, scrolling, resizing or a press outside close it.
 * Portal: the opener often sits in a sticky or clipped column, and a fixed menu is placed against the viewport.
 */
export function ContextMenu({ x, y, label, items, onClose }: { x: number; y: number; label: string; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} onContextMenu={(event) => event.preventDefault()} />
      <div
        role="menu"
        aria-label={label}
        className="fixed z-50 rounded-xl border border-[#1E2330] bg-[#10131A] p-1 shadow-xl"
        style={{ width: WIDTH, left: Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8)), top: Math.max(8, Math.min(y, window.innerHeight - 8 - 44 * items.length)) }}
      >
        {items.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            autoFocus={index === 0}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-white/5 ${item.danger ? 'text-[#E7A3A3]' : 'text-[#E8EAF0]'}`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  )
}
