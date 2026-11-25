import { formatDayInput, parseDay } from './period'
import { DEFAULT_PLAN_ID, newId, weekOf } from './plan'

/** A training plan. Its sessions and week tags belong to it; every planner tab shows the active one. */
export type PlanInfo = {
  id: string
  name: string
  objective: string
  /** Local YYYY-MM-DD of the target run, when the athlete has one. */
  raceDate: string | null
}

export type PlanBook = {
  plans: PlanInfo[]
  activeId: string
}

/** What the plan form edits. */
export type PlanDraft = {
  name: string
  objective: string
  raceDate: string | null
}

export const NAME_MAX = 60
export const OBJECTIVE_MAX = 280

const KEY = 'asphaltburner.plans.v1'
const DAY = /^\d{4}-\d{2}-\d{2}$/
const FALLBACK_NAME = 'Untitled plan'

/** A real calendar day written as YYYY-MM-DD. */
export function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY.test(value) && formatDayInput(parseDay(value)) === value
}

export function cleanDraft(draft: PlanDraft): PlanDraft {
  return {
    name: draft.name.trim().slice(0, NAME_MAX),
    objective: draft.objective.trim().slice(0, OBJECTIVE_MAX),
    raceDate: isDay(draft.raceDate) ? draft.raceDate : null,
  }
}

export function defaultBook(): PlanBook {
  return { plans: [{ id: DEFAULT_PLAN_ID, name: 'My plan', objective: '', raceDate: null }], activeId: DEFAULT_PLAN_ID }
}

function cleanPlan(raw: unknown): PlanInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id) return null
  const draft = cleanDraft({
    name: typeof row.name === 'string' ? row.name : '',
    objective: typeof row.objective === 'string' ? row.objective : '',
    raceDate: isDay(row.raceDate) ? row.raceDate : null,
  })
  return { id: row.id, ...draft, name: draft.name || FALLBACK_NAME }
}

/** Always returns at least one plan and an active id that exists. */
export function normalizeBook(raw: unknown): PlanBook {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const seen = new Set<string>()
  const plans: PlanInfo[] = []
  for (const item of Array.isArray(row.plans) ? row.plans : []) {
    const plan = cleanPlan(item)
    if (!plan || seen.has(plan.id)) continue
    seen.add(plan.id)
    plans.push(plan)
  }
  if (plans.length === 0) return defaultBook()
  const activeId = typeof row.activeId === 'string' && seen.has(row.activeId) ? row.activeId : plans[0].id
  return { plans, activeId }
}

export function loadBook(): PlanBook {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeBook(JSON.parse(raw)) : defaultBook()
  } catch {
    return defaultBook()
  }
}

export function saveBook(book: PlanBook): PlanBook {
  const next = normalizeBook(book)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* the plans still apply for this visit */
  }
  return next
}

export function activePlan(book: PlanBook): PlanInfo {
  return book.plans.find((plan) => plan.id === book.activeId) ?? book.plans[0]
}

/** The new plan becomes the active one. */
export function addPlan(book: PlanBook, draft: PlanDraft): { book: PlanBook; id: string } {
  const clean = cleanDraft(draft)
  const id = newId()
  const plan: PlanInfo = { id, ...clean, name: clean.name || FALLBACK_NAME }
  return { book: { plans: [...book.plans, plan], activeId: id }, id }
}

export function updatePlan(book: PlanBook, id: string, draft: PlanDraft): PlanBook {
  const clean = cleanDraft(draft)
  return { ...book, plans: book.plans.map((plan) => (plan.id === id ? { ...plan, ...clean, name: clean.name || plan.name } : plan)) }
}

/** The last plan cannot be deleted. When the active plan goes, the first one that is left takes over. */
export function removePlan(book: PlanBook, id: string): PlanBook {
  if (book.plans.length <= 1 || !book.plans.some((plan) => plan.id === id)) return book
  const plans = book.plans.filter((plan) => plan.id !== id)
  return { plans, activeId: book.activeId === id ? plans[0].id : book.activeId }
}

export function selectPlan(book: PlanBook, id: string): PlanBook {
  return book.plans.some((plan) => plan.id === id) ? { ...book, activeId: id } : book
}

/** Whole weeks from the current week to the week of the run. Negative once the run is behind. */
export function weeksToRace(raceDate: string, now: Date = new Date()): number {
  const here = parseDay(weekOf(now)).getTime()
  const there = parseDay(weekOf(parseDay(raceDate))).getTime()
  return Math.round((there - here) / (7 * 24 * 60 * 60 * 1000))
}

/** Short countdown for the plan picker. Null when there is no run date or it is long past. */
export function raceText(raceDate: string | null, now: Date = new Date()): string | null {
  if (!raceDate) return null
  const weeks = weeksToRace(raceDate, now)
  if (weeks > 1) return `${weeks} weeks to go`
  if (weeks === 1) return 'Next week'
  if (weeks === 0) return 'This week'
  return null
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('plans.ts')) {
  const start = defaultBook()
  if (start.plans.length !== 1 || start.activeId !== DEFAULT_PLAN_ID) throw new Error('default book')

  const added = addPlan(start, { name: '  Marathon  ', objective: ' sub 3h30 ', raceDate: '2027-04-18' })
  const marathon = added.book.plans[1]
  if (added.book.activeId !== added.id || marathon.name !== 'Marathon' || marathon.objective !== 'sub 3h30' || marathon.raceDate !== '2027-04-18') {
    throw new Error(`add ${JSON.stringify(added.book)}`)
  }
  const blank = addPlan(start, { name: '   ', objective: '', raceDate: 'nope' }).book.plans[1]
  if (blank.name !== FALLBACK_NAME || blank.raceDate !== null) throw new Error(`blank ${JSON.stringify(blank)}`)

  const renamed = updatePlan(added.book, added.id, { name: 'Marathon 2027', objective: '', raceDate: null })
  if (renamed.plans[1].name !== 'Marathon 2027' || renamed.plans[1].raceDate !== null || renamed.plans[0].name !== 'My plan') throw new Error('update')
  if (updatePlan(added.book, added.id, { name: '  ', objective: '', raceDate: null }).plans[1].name !== 'Marathon') throw new Error('empty name keeps the old one')

  const gone = removePlan(added.book, added.id)
  if (gone.plans.length !== 1 || gone.activeId !== DEFAULT_PLAN_ID) throw new Error('remove active falls back to first')
  if (removePlan(start, DEFAULT_PLAN_ID).plans.length !== 1) throw new Error('last plan stays')
  if (selectPlan(added.book, 'missing').activeId !== added.id || selectPlan(added.book, DEFAULT_PLAN_ID).activeId !== DEFAULT_PLAN_ID) throw new Error('select')

  const repaired = normalizeBook({ plans: [{ id: 'a', name: 'A', raceDate: '2026-02-30' }, { id: 'a', name: 'dup' }, { id: 'b' }, { name: 'no id' }], activeId: 'zzz' })
  if (repaired.plans.length !== 2 || repaired.activeId !== 'a' || repaired.plans[0].raceDate !== null || repaired.plans[1].name !== FALLBACK_NAME) {
    throw new Error(`normalize ${JSON.stringify(repaired)}`)
  }
  if (normalizeBook('junk').plans.length !== 1 || normalizeBook({ plans: [] }).activeId !== DEFAULT_PLAN_ID) throw new Error('empty book')

  const now = new Date(2026, 10, 24, 12)
  if (weeksToRace('2026-12-20', now) !== 3 || raceText('2026-12-20', now) !== '3 weeks to go') throw new Error('weeks to go')
  if (raceText('2026-12-06', now) !== 'Next week' || raceText('2026-11-29', now) !== 'This week' || raceText('2026-11-01', now) !== null || raceText(null, now) !== null) {
    throw new Error('race text')
  }
}
