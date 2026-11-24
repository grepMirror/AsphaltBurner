import { formatDayInput, parseDay } from './period'
import { newId, shiftWeek, weekOf } from './plan'

/** The type of a block of weeks (VMA, Tapering, …). Weeks are tagged with a kind; an untagged week has none. */
export type BlockKind = {
  id: string
  label: string
  /** #RRGGBB. */
  color: string
  custom: boolean
}

export type BlockBook = {
  /** Types made by the athlete. They are shared by every plan. */
  custom: BlockKind[]
  /** Plan id, then Monday of the week, then kind id. A week that is not listed has no tag. */
  tags: Record<string, Record<string, string>>
}

export const BUILT_IN_KINDS: readonly BlockKind[] = [
  { id: 'vma', label: 'VMA', color: '#F07167', custom: false },
  { id: 'specific', label: 'Specific', color: '#C58BE0', custom: false },
  { id: 'threshold', label: 'Threshold', color: '#F0A05A', custom: false },
  { id: 'grimpette', label: 'Grimpette', color: '#9BB8F0', custom: false },
  { id: 'tapering', label: 'Tapering', color: '#9DDBC0', custom: false },
  { id: 'assimilation', label: 'Assimilation', color: '#E8C47C', custom: false },
]

/** Quick colors offered next to the color picker. */
export const SWATCHES = ['#F07167', '#F0A05A', '#E8C47C', '#9DDBC0', '#7DD3C7', '#5EB0C8', '#9BB8F0', '#C58BE0', '#E58BBF', '#B7C0CE']

export const KIND_LABEL_MAX = 20

const KEY = 'asphaltburner.blocks.v1'
const HEX = /^#[0-9a-fA-F]{6}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const EMPTY_TAGS: Record<string, string> = {}

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

export function emptyBlocks(): BlockBook {
  return { custom: [], tags: {} }
}

export function kindsOf(book: BlockBook): BlockKind[] {
  return [...BUILT_IN_KINDS, ...book.custom]
}

export function kindOf(book: BlockBook, id: string | null | undefined): BlockKind | null {
  if (!id) return null
  return kindsOf(book).find((kind) => kind.id === id) ?? null
}

/** The tags of one plan. Never undefined, so the caller can index it directly. */
export function tagsOf(book: BlockBook, planId: string): Record<string, string> {
  return book.tags[planId] ?? EMPTY_TAGS
}

function cleanKind(raw: unknown, taken: Set<string>): BlockKind | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id || taken.has(row.id)) return null
  const label = typeof row.label === 'string' ? row.label.trim().slice(0, KIND_LABEL_MAX) : ''
  if (!label || !isHex(row.color)) return null
  return { id: row.id, label, color: row.color, custom: true }
}

export function normalizeBlocks(raw: unknown): BlockBook {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const taken = new Set(BUILT_IN_KINDS.map((kind) => kind.id))
  const custom: BlockKind[] = []
  for (const item of Array.isArray(row.custom) ? row.custom : []) {
    const kind = cleanKind(item, taken)
    if (!kind) continue
    taken.add(kind.id)
    custom.push(kind)
  }
  const tags: BlockBook['tags'] = {}
  const plans = row.tags && typeof row.tags === 'object' ? (row.tags as Record<string, unknown>) : {}
  for (const [planId, weeks] of Object.entries(plans)) {
    if (!weeks || typeof weeks !== 'object') continue
    const clean: Record<string, string> = {}
    for (const [week, kind] of Object.entries(weeks as Record<string, unknown>)) {
      if (!DAY.test(week) || typeof kind !== 'string' || !taken.has(kind)) continue
      clean[weekOf(parseDay(week))] = kind
    }
    if (Object.keys(clean).length > 0) tags[planId] = clean
  }
  return { custom, tags }
}

export function loadBlocks(): BlockBook {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeBlocks(JSON.parse(raw)) : emptyBlocks()
  } catch {
    return emptyBlocks()
  }
}

export function saveBlocks(book: BlockBook): BlockBook {
  const next = normalizeBlocks(book)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* the tags still apply for this visit */
  }
  return next
}

/** Gives every given week this kind, or clears them when `kindId` is null. An unknown kind changes nothing. */
export function tagWeeks(book: BlockBook, planId: string, weeks: readonly string[], kindId: string | null): BlockBook {
  if (kindId !== null && !kindOf(book, kindId)) return book
  const next = { ...tagsOf(book, planId) }
  for (const week of weeks) {
    if (kindId === null) delete next[week]
    else next[week] = kindId
  }
  const tags = { ...book.tags }
  if (Object.keys(next).length === 0) delete tags[planId]
  else tags[planId] = next
  return { ...book, tags }
}

export function kindNameTaken(book: BlockBook, label: string): boolean {
  const wanted = label.trim().toLowerCase()
  return kindsOf(book).some((kind) => kind.label.toLowerCase() === wanted)
}

/** Adds a custom type. A name that is empty or already used is refused with a null id. */
export function addKind(book: BlockBook, label: string, color: string): { book: BlockBook; id: string | null } {
  const clean = label.trim().slice(0, KIND_LABEL_MAX)
  if (!clean || kindNameTaken(book, clean)) return { book, id: null }
  const id = `custom-${newId()}`
  return { book: { ...book, custom: [...book.custom, { id, label: clean, color: isHex(color) ? color : SWATCHES[0], custom: true }] }, id }
}

/** Removes a custom type and the tags that used it, in every plan. Built-in types stay. */
export function removeKind(book: BlockBook, id: string): BlockBook {
  if (!book.custom.some((kind) => kind.id === id)) return book
  const tags: BlockBook['tags'] = {}
  for (const [planId, weeks] of Object.entries(book.tags)) {
    const kept = Object.fromEntries(Object.entries(weeks).filter(([, kind]) => kind !== id))
    if (Object.keys(kept).length > 0) tags[planId] = kept
  }
  return { custom: book.custom.filter((kind) => kind.id !== id), tags }
}

/** Forgets every tag of a plan that was deleted. */
export function clearPlanTags(book: BlockBook, planId: string): BlockBook {
  if (!(planId in book.tags)) return book
  const tags = { ...book.tags }
  delete tags[planId]
  return { ...book, tags }
}

/** Number of weeks, across all plans, that carry this kind. */
export function weeksUsing(book: BlockBook, id: string): number {
  return Object.values(book.tags).reduce((sum, weeks) => sum + Object.values(weeks).filter((kind) => kind === id).length, 0)
}

/** Mondays from one week to the other, both included, whichever comes first. */
export function weeksBetween(from: string, to: string): string[] {
  const [first, last] = from <= to ? [from, to] : [to, from]
  const weeks: string[] = []
  for (let week = first, guard = 0; week <= last && guard < 530; week = shiftWeek(week, 1), guard += 1) weeks.push(week)
  return weeks
}

/** The run of consecutive weeks around `week` that share its kind. Empty for an untagged week. */
export function runOf(tags: Record<string, string>, week: string): string[] {
  const kind = tags[week]
  if (!kind) return []
  const run = [week]
  for (let previous = shiftWeek(week, -1); tags[previous] === kind; previous = shiftWeek(previous, -1)) run.unshift(previous)
  for (let next = shiftWeek(week, 1); tags[next] === kind; next = shiftWeek(next, 1)) run.push(next)
  return run
}

/** Black or white, whichever reads better on this color. */
export function inkOn(color: string): string {
  if (!isHex(color)) return '#0B0D12'
  const channel = (start: number) => parseInt(color.slice(start, start + 2), 16) / 255
  const lin = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * lin(channel(1)) + 0.7152 * lin(channel(3)) + 0.0722 * lin(channel(5))
  // 0.179 is where black and white give the same contrast ratio.
  return luminance > 0.179 ? '#0B0D12' : '#FFFFFF'
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('blocks.ts')) {
  if (BUILT_IN_KINDS.map((kind) => kind.label).join() !== 'VMA,Specific,Threshold,Grimpette,Tapering,Assimilation') throw new Error('built-in kinds')
  if (!BUILT_IN_KINDS.every((kind) => isHex(kind.color))) throw new Error('built-in colors')

  let book = emptyBlocks()
  book = tagWeeks(book, 'p1', ['2026-11-16', '2026-11-23', '2026-11-30'], 'vma')
  book = tagWeeks(book, 'p1', ['2026-11-23'], 'threshold')
  book = tagWeeks(book, 'p2', ['2026-11-16'], 'tapering')
  if (tagsOf(book, 'p1')['2026-11-16'] !== 'vma' || tagsOf(book, 'p1')['2026-11-23'] !== 'threshold' || tagsOf(book, 'p2')['2026-11-16'] !== 'tapering') {
    throw new Error(`tag ${JSON.stringify(book)}`)
  }
  if (tagsOf(book, 'nobody')['2026-11-16'] !== undefined) throw new Error('other plan')
  if (tagWeeks(book, 'p1', ['2026-12-07'], 'nope') !== book) throw new Error('unknown kind changes nothing')

  if (runOf(tagsOf(book, 'p1'), '2026-11-30').join() !== '2026-11-30' || runOf(tagsOf(book, 'p1'), '2026-12-07').length !== 0) throw new Error('run')
  const joined = tagWeeks(book, 'p1', ['2026-11-23'], 'vma')
  if (runOf(tagsOf(joined, 'p1'), '2026-11-30').join() !== '2026-11-16,2026-11-23,2026-11-30') throw new Error('run across weeks')

  const cleared = tagWeeks(joined, 'p1', ['2026-11-16', '2026-11-23', '2026-11-30'], null)
  if ('p1' in cleared.tags || cleared.tags.p2['2026-11-16'] !== 'tapering') throw new Error('clear tag')

  const made = addKind(book, '  Hills  ', '#12ab34')
  if (!made.id || kindOf(made.book, made.id)?.label !== 'Hills' || kindOf(made.book, made.id)?.color !== '#12ab34' || !kindOf(made.book, made.id)?.custom) throw new Error('add kind')
  if (addKind(made.book, 'hills', '#000000').id !== null || addKind(book, 'vma', '#000000').id !== null || addKind(book, '   ', '#000000').id !== null) throw new Error('duplicate or empty name')
  if (kindOf(addKind(book, 'Odd', 'red').book, addKind(book, 'Odd', 'red').id) !== null && addKind(book, 'Odd', 'red').book.custom[0].color !== SWATCHES[0]) throw new Error('bad color falls back')

  const used = tagWeeks(made.book, 'p1', ['2026-12-07', '2026-12-14'], made.id!)
  if (weeksUsing(used, made.id!) !== 2) throw new Error('weeks using')
  const dropped = removeKind(used, made.id!)
  if (dropped.custom.length !== 0 || tagsOf(dropped, 'p1')['2026-12-07'] !== undefined || tagsOf(dropped, 'p1')['2026-11-16'] !== 'vma') throw new Error('remove kind')
  if (removeKind(book, 'vma') !== book) throw new Error('built-in kinds stay')
  if ('p2' in clearPlanTags(book, 'p2').tags || !('p1' in clearPlanTags(book, 'p2').tags)) throw new Error('clear plan tags')

  const mended = normalizeBlocks({
    custom: [{ id: 'vma', label: 'dup', color: '#ffffff' }, { id: 'c1', label: ' Mine ', color: '#abcdef' }, { id: 'c2', label: '', color: '#abcdef' }, { id: 'c3', label: 'x', color: 'blue' }],
    tags: { p1: { '2026-11-18': 'c1', 'nope': 'vma', '2026-11-16': 'ghost' }, p2: { '2026-11-16': 'ghost' } },
  })
  if (mended.custom.length !== 1 || mended.custom[0].label !== 'Mine' || tagsOf(mended, 'p1')['2026-11-16'] !== 'c1' || 'p2' in mended.tags || Object.keys(tagsOf(mended, 'p1')).length !== 1) {
    throw new Error(`normalize ${JSON.stringify(mended)}`)
  }
  if (normalizeBlocks(42).custom.length !== 0) throw new Error('junk')

  if (weeksBetween('2026-12-07', '2026-11-30').join() !== '2026-11-30,2026-12-07' || weeksBetween('2026-11-16', '2026-11-16').length !== 1 || weeksBetween('2026-11-02', '2026-12-28').length !== 9) throw new Error('weeks between')
  if (inkOn('#F07167') !== '#0B0D12' || inkOn('#101820') !== '#FFFFFF') throw new Error('ink')
  if (formatDayInput(parseDay('2026-11-16')) !== '2026-11-16') throw new Error('day round trip')
}
