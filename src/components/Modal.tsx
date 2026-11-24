import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Dialog shared by the planner and the profile popup.
 * Centered card on desktop, bottom sheet on a phone. Escape and a tap outside close it.
 */
export function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const titleId = useId()
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [])

  // Portal: the header has backdrop-blur, which would trap a fixed dialog inside the 56px bar.
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // dvh follows the visible screen: with vh, a phone's address bar pushes the top of the sheet, and its close button, off screen.
        // Where dvh is unknown the style is ignored and the 92vh class applies. Either way a strip of the backdrop stays tappable above the sheet.
        style={{ maxHeight: 'min(92vh, calc(100dvh - 2.5rem))' }}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-[22px] border border-[#1E2330] bg-[#10131A] text-[#E8EAF0] shadow-2xl sm:rounded-[22px] ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'}`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {title}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg text-[#9AA3B5] hover:bg-white/5 hover:text-[#E8EAF0] sm:h-8 sm:w-8">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="m2.5 2.5 9 9m0-9-9 9" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
