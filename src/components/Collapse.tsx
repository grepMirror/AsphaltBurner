import { useId, useState, type ReactNode } from 'react'

/** Folds its content on phones and tablets. From the lg breakpoint the content is always shown and the toggle is hidden. */
export function Collapse({
  label,
  children,
  className = '',
  open: openProp,
  onOpenChange,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = openProp ?? localOpen
  const id = useId()
  const toggle = () => {
    const next = !open
    setLocalOpen(next)
    onOpenChange?.(next)
  }
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-xs font-medium text-white/60 lg:hidden"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M4.5 7.5 10 13l5.5-5.5" />
        </svg>
      </button>
      <div id={id} className={open ? '' : 'hidden lg:block'}>
        {children}
      </div>
    </div>
  )
}
