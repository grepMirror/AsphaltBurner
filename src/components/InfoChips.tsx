import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type InfoChip = {
  id: string
  label: string
  color: string
  /** Realized: filled. Planned: outline. */
  done: boolean
  /** Shown in the card on hover, focus or a long press. */
  body: ReactNode
}

const CARD_WIDTH = 264
const HOLD_MS = 380

/**
 * A row of small chips, one per activity. A chip shows its type; the card with the main information
 * opens on hover or focus, on a long press with a finger, and on a click or tap (pinned until the next press).
 */
export function InfoChips({ chips }: { chips: InfoChip[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li key={chip.id}>
          <Chip chip={chip} />
        </li>
      ))}
    </ul>
  )
}

type Open = { left: number; top?: number; bottom?: number; pinned: boolean }

function Chip({ chip }: { chip: InfoChip }) {
  const [open, setOpen] = useState<Open | null>(null)
  const hold = useRef<number | null>(null)
  /** The card was opened by a long press: the click that follows the release must leave it open. */
  const held = useRef(false)
  const cardId = useId()

  const show = (target: Element, pinned: boolean) => {
    const box = target.getBoundingClientRect()
    const below = box.bottom + 8
    // Not enough room below: put the card above the chip.
    const above = window.innerHeight - below < 190 && box.top > 190
    setOpen({
      left: Math.max(8, Math.min(box.left, window.innerWidth - CARD_WIDTH - 8)),
      ...(above ? { bottom: window.innerHeight - box.top + 8 } : { top: below }),
      pinned,
    })
  }
  const cancelHold = () => {
    if (hold.current !== null) window.clearTimeout(hold.current)
    hold.current = null
  }

  useEffect(() => cancelHold, [])
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-describedby={open ? cardId : undefined}
        onPointerEnter={(event) => event.pointerType === 'mouse' && show(event.currentTarget, false)}
        onPointerLeave={(event) => {
          cancelHold()
          if (event.pointerType === 'mouse') setOpen((current) => (current?.pinned ? current : null))
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return
          const target = event.currentTarget
          cancelHold()
          held.current = false
          hold.current = window.setTimeout(() => {
            held.current = true
            show(target, true)
          }, HOLD_MS)
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onFocus={(event) => event.currentTarget.matches(':focus-visible') && show(event.currentTarget, false)}
        onBlur={() => setOpen((current) => (current?.pinned ? current : null))}
        onClick={(event) => {
          if (held.current) {
            held.current = false
            return
          }
          show(event.currentTarget, true)
        }}
        // The long press of a phone would open the browser's own menu.
        onContextMenu={(event) => event.preventDefault()}
        className="flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold outline-none focus-visible:ring-1 focus-visible:ring-white/40 [-webkit-touch-callout:none]"
        style={{ color: chip.color, borderColor: chip.done ? `${chip.color}00` : `${chip.color}66`, background: chip.done ? `${chip.color}26` : 'transparent' }}
      >
        {chip.done ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m2.5 6.4 2.3 2.3 4.7-5" />
          </svg>
        ) : (
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full border" style={{ borderColor: chip.color }} />
        )}
        {chip.label}
      </button>
      {open
        ? createPortal(
            <>
              {open.pinned ? <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(null)} /> : null}
              <div
                id={cardId}
                role="tooltip"
                className="pointer-events-none fixed z-50 rounded-xl border border-[#2A3140] bg-[#10131A] p-3 text-xs shadow-xl"
                style={{ width: CARD_WIDTH, left: open.left, top: open.top, bottom: open.bottom }}
              >
                {chip.body}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  )
}
