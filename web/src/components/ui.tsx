import type { ReactNode } from 'react'
import type { QuickItem } from '../data/matrix'

export function ChartCard({
  title,
  subtitle,
  note,
  aside,
  children,
}: {
  title: string
  subtitle?: string
  note?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-[#0c1118]/90 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-white/45">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {aside}
          <IconButton label={`Understand how ${title} is built and read`}>i</IconButton>
          <IconButton label={`View ${title} fullscreen`}>↗</IconButton>
        </div>
      </header>
      {note ? <p className="mt-2 max-w-3xl text-xs leading-5 text-white/35">{note}</p> : null}
      {children}
    </section>
  )
}

export function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-xs text-white/50"
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accent,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
  accent: string
}) {
  return (
    <div className="flex rounded-md bg-black/50 p-0.5 text-xs">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="rounded px-2.5 py-1"
            style={active ? { background: accent, color: '#07110e' } : { color: 'rgba(255,255,255,0.55)' }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const toneLabel: Record<QuickItem['tone'], string> = {
  cohort: 'Cohort',
  profile: 'Profile',
  limit: 'Limit',
  observation: 'Observation',
}

export function QuickRead({ items }: { items: QuickItem[] }) {
  return (
    <ChartCard title="Quick read">
      <ul className="mt-3 divide-y divide-white/10">
        {items.map((item) => (
          <li key={item.text} className="flex gap-3 py-3 text-sm leading-6 text-white/75">
            <span className="mt-1 text-white/40">{item.tone === 'limit' ? '○' : '◉'}</span>
            <p>
              <span className="mr-2 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
                {toneLabel[item.tone]}
              </span>
              {item.text}
            </p>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

export function StatRow({ stats }: { stats: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className="text-xs text-white/40">{stat.label}</p>
          <p className="font-display text-2xl font-semibold text-white">{stat.value}</p>
          {stat.hint ? <p className="text-xs text-white/35">{stat.hint}</p> : null}
        </div>
      ))}
    </div>
  )
}
