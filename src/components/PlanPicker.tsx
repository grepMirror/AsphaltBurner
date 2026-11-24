import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { NAME_MAX, OBJECTIVE_MAX, activePlan, raceText, type PlanBook, type PlanDraft, type PlanInfo } from '../lib/plans'
import { parseDay } from '../lib/period'
import { Modal } from './Modal'

type Props = {
  book: PlanBook
  /** Sessions a plan holds, shown before it is deleted. */
  sessionCount: (planId: string) => number
  onSelect: (id: string) => void
  onCreate: (draft: PlanDraft) => void
  onUpdate: (id: string, draft: PlanDraft) => void
  onDelete: (id: string) => void
}

/** `null` is a new plan; an id edits that plan. Undefined keeps the form closed. */
type FormTarget = string | null | undefined

/** Dropdown to choose the plan, with an edit icon on the current plan and on each row. */
export function PlanPicker({ book, sessionCount, onSelect, onCreate, onUpdate, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormTarget>(undefined)
  const [removing, setRemoving] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = activePlan(book)
  const race = raceText(current.raceDate)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const target = form === undefined ? undefined : form === null ? null : book.plans.find((plan) => plan.id === form)

  return (
    <div ref={rootRef} className="relative flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-9 min-w-0 items-center gap-2 rounded-xl border bg-[#12161E] pl-3 pr-2.5 text-sm hover:border-[#3A4150] ${open ? 'border-[#4A5264]' : 'border-[#262C3B]'}`}
      >
        <span className="sr-only">Plan:</span>
        <span className="min-w-0 max-w-[9rem] truncate font-semibold text-[#E8EAF0] sm:max-w-[16rem]">{current.name}</span>
        {race ? <span className="hidden shrink-0 whitespace-nowrap text-xs text-[#9AA3B5] md:inline">· {race}</span> : null}
        <ChevronDown />
      </button>
      <IconButton label={`Edit ${current.name}`} onClick={() => setForm(current.id)}>
        <PencilIcon />
      </IconButton>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[#1E2330] bg-[#10131A] p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">Plans</p>
          <ul>
            {book.plans.map((plan) => {
              const on = plan.id === book.activeId
              return (
                <li key={plan.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    onClick={() => {
                      onSelect(plan.id)
                      setOpen(false)
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/5 ${on ? 'bg-white/[0.04]' : ''}`}
                  >
                    <span className="grid h-4 w-4 shrink-0 place-items-center text-[#9DDBC0]">{on ? <CheckIcon /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#E8EAF0]">{plan.name}</span>
                      <span className="block truncate text-xs text-[#9AA3B5]">{subtitle(plan)}</span>
                    </span>
                  </button>
                  <IconButton
                    label={`Edit ${plan.name}`}
                    onClick={() => {
                      setOpen(false)
                      setForm(plan.id)
                    }}
                  >
                    <PencilIcon />
                  </IconButton>
                  {book.plans.length > 1 ? (
                    <IconButton
                      label={`Delete ${plan.name}`}
                      danger
                      onClick={() => {
                        setOpen(false)
                        setRemoving(plan.id)
                      }}
                    >
                      <BinIcon />
                    </IconButton>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setForm(null)
            }}
            className="mt-1 flex w-full items-center gap-2.5 rounded-xl border-t border-[#1E2330] px-2.5 py-2.5 text-left text-sm font-semibold text-[#E8EAF0] hover:bg-white/5"
          >
            <span className="grid h-4 w-4 place-items-center text-lg leading-none">+</span>
            New plan
          </button>
        </div>
      ) : null}

      {removing !== null && book.plans.some((plan) => plan.id === removing) ? (
        <DeleteConfirm
          plan={book.plans.find((plan) => plan.id === removing) as PlanInfo}
          sessions={sessionCount(removing)}
          onClose={() => setRemoving(null)}
          onDelete={() => {
            onDelete(removing)
            setRemoving(null)
          }}
        />
      ) : null}

      {target !== undefined ? (
        <PlanForm
          key={target?.id ?? 'new'}
          plan={target}
          canDelete={target !== null && book.plans.length > 1}
          sessions={target ? sessionCount(target.id) : 0}
          onClose={() => setForm(undefined)}
          onSave={(draft) => {
            if (target) onUpdate(target.id, draft)
            else onCreate(draft)
            setForm(undefined)
          }}
          onDelete={() => {
            if (target) onDelete(target.id)
            setForm(undefined)
          }}
        />
      ) : null}
    </div>
  )
}

function subtitle(plan: PlanInfo): string {
  const parts = [plan.raceDate ? `Run ${dayLabel(plan.raceDate)}` : null, plan.objective || null].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(' · ') : 'No run date yet'
}

function dayLabel(day: string): string {
  return parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PlanForm({
  plan,
  canDelete,
  sessions,
  onClose,
  onSave,
  onDelete,
}: {
  plan: PlanInfo | null
  canDelete: boolean
  sessions: number
  onClose: () => void
  onSave: (draft: PlanDraft) => void
  onDelete: () => void
}) {
  const ids = { name: useId(), objective: useId(), date: useId() }
  const [name, setName] = useState(plan?.name ?? '')
  const [objective, setObjective] = useState(plan?.objective ?? '')
  const [raceDate, setRaceDate] = useState(plan?.raceDate ?? '')
  const [missing, setMissing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const race = raceDate ? raceText(raceDate) : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') {
      setMissing(true)
      return
    }
    onSave({ name, objective, raceDate: raceDate || null })
  }

  return (
    <Modal title={plan ? 'Edit plan' : 'New plan'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor={ids.name} className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">
            Name
          </label>
          <input
            id={ids.name}
            autoFocus
            value={name}
            maxLength={NAME_MAX}
            aria-invalid={missing}
            aria-describedby={missing ? `${ids.name}-error` : undefined}
            placeholder="Marathon build, Base phase…"
            onChange={(event) => {
              setName(event.target.value)
              setMissing(false)
            }}
            className={`mt-1.5 w-full rounded-xl border bg-[#0F1218] px-3.5 py-2.5 text-sm text-[#E8EAF0] outline-none placeholder:text-[#5A6275] focus:border-[#4A5264] ${missing ? 'border-[#E7A3A3]' : 'border-[#1E2330]'}`}
          />
          {missing ? (
            <p id={`${ids.name}-error`} className="mt-1.5 text-xs text-[#E7A3A3]">
              Give the plan a name.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={ids.objective} className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">
            Objective
            <span className="normal-case tracking-normal text-[#5A6275]">Optional</span>
          </label>
          <textarea
            id={ids.objective}
            rows={3}
            value={objective}
            maxLength={OBJECTIVE_MAX}
            placeholder="What this plan is for. A time, a distance, a feeling."
            onChange={(event) => setObjective(event.target.value)}
            className="mt-1.5 w-full resize-none rounded-xl border border-[#1E2330] bg-[#0F1218] px-3.5 py-2.5 text-sm text-[#E8EAF0] outline-none placeholder:text-[#5A6275] focus:border-[#4A5264]"
          />
        </div>

        <div>
          <label htmlFor={ids.date} className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">
            Run date
            <span className="normal-case tracking-normal text-[#5A6275]">Optional</span>
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id={ids.date}
              type="date"
              value={raceDate}
              onChange={(event) => setRaceDate(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-[#1E2330] bg-[#0F1218] px-3.5 py-2.5 text-sm text-[#E8EAF0] outline-none [color-scheme:dark] focus:border-[#4A5264]"
            />
            {raceDate ? (
              <button type="button" onClick={() => setRaceDate('')} className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#9AA3B5] hover:bg-white/5 hover:text-[#E8EAF0]">
                Clear
              </button>
            ) : null}
          </div>
          {raceDate ? <p className="mt-1.5 text-xs text-[#9AA3B5]">{race ?? 'This date has passed.'}</p> : null}
        </div>

        {confirming && plan ? (
          <div role="alert" className="rounded-xl border border-[#E7A3A3]/40 bg-[#E7A3A3]/10 p-3.5">
            <p className="text-sm text-[#E8EAF0]">
              Delete <span className="font-semibold">{plan.name}</span>? {sessions === 0 ? 'It has no session.' : `Its ${sessions} ${sessions === 1 ? 'session' : 'sessions'} and week tags go with it.`} This cannot be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onDelete} className="rounded-full bg-[#E7A3A3] px-4 py-2 text-xs font-semibold text-[#0B0D12]">
                Delete plan
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-4 py-2 text-xs font-semibold text-[#C5CAD3] hover:bg-white/5">
                Keep it
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          {plan && canDelete && !confirming ? (
            <button type="button" onClick={() => setConfirming(true)} className="mr-auto rounded-full px-3 py-2 text-xs font-semibold text-[#E7A3A3] hover:bg-[#E7A3A3]/10">
              Delete plan
            </button>
          ) : (
            <span className="mr-auto" />
          )}
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#C5CAD3] hover:bg-white/5">
            Cancel
          </button>
          <button type="submit" className="rounded-full bg-[#E8EAF0] px-5 py-2.5 text-sm font-semibold text-[#0B0D12] hover:bg-white">
            {plan ? 'Save' : 'Create plan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** What deleting a plan takes with it, and the choice to keep it. */
function DeleteConfirm({ plan, sessions, onClose, onDelete }: { plan: PlanInfo; sessions: number; onClose: () => void; onDelete: () => void }) {
  return (
    <Modal title="Delete plan" onClose={onClose}>
      <p className="text-sm text-[#E8EAF0]">
        Delete <span className="font-semibold">{plan.name}</span>? {sessions === 0 ? 'It has no session.' : `Its ${sessions} ${sessions === 1 ? 'session' : 'sessions'} and week tags go with it.`} This cannot be undone.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" autoFocus onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#C5CAD3] hover:bg-white/5">
          Keep it
        </button>
        <button type="button" onClick={onDelete} className="rounded-full bg-[#E7A3A3] px-5 py-2.5 text-sm font-semibold text-[#0B0D12]">
          Delete plan
        </button>
      </div>
    </Modal>
  )
}

function IconButton({ label, onClick, danger = false, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#9AA3B5] hover:bg-white/5 ${danger ? 'hover:text-[#E7A3A3]' : 'hover:text-[#E8EAF0]'}`}
    >
      {children}
    </button>
  )
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.8 13.2 3.4 10 10.8 2.6a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2L6 12.6l-3.2.6Z" />
      <path d="m9.6 3.8 2.6 2.6" />
    </svg>
  )
}

function BinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 4.5h9M6.2 4.4V3.2h3.6v1.2M4.4 4.5l.5 8.2h6.2l.5-8.2" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#9AA3B5]" aria-hidden="true">
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  )
}
