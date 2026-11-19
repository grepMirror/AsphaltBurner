import type { ReactNode } from 'react'

export function ChartNote({ label, align = 'left', children }: { label: string; align?: 'left' | 'right'; children: ReactNode }) {
  return (
    <details
      className="pointer-events-auto relative shrink-0"
      onToggle={(event) => {
        const panel = event.currentTarget.querySelector('div')
        if (!panel || !event.currentTarget.open) return
        const room = window.innerHeight - panel.getBoundingClientRect().top - 80
        panel.style.maxHeight = `${Math.max(96, room)}px`
      }}
    >
      <summary
        aria-label={label}
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-white/50 ring-1 ring-inset ring-white/25 marker:content-none [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="8" cy="4.6" r="0.75" fill="currentColor" />
        </svg>
      </summary>
      <div className={`absolute z-20 mt-2 max-h-[70vh] w-80 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-lg border border-white/15 bg-[#0b0e14] p-3 text-left text-xs leading-relaxed text-white/70 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}>
        {children}
      </div>
    </details>
  )
}
