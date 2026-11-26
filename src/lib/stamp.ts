import { profileKey, TOMBSTONES_KEY } from './profileData'

/** Every synced item carries the time of its last local change. */
export type Stamped = { id: string; updatedAt?: string }

/** Removed items: id -> time of the removal. A newer item with the same id is still kept. */
export type Tombstones = { plans: Record<string, string>; sessions: Record<string, string> }

export const NO_TOMBSTONES: Tombstones = { plans: {}, sessions: {} }

/** JSON with sorted keys, so objects with the same content compare equal. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  )
}

function withoutStamp(value: object): Record<string, unknown> {
  const copy = { ...(value as Record<string, unknown>) }
  delete copy.updatedAt
  return copy
}

/** Same content, ignoring the stamp. */
export function sameContent(a: object, b: object): boolean {
  return stableJson(withoutStamp(a)) === stableJson(withoutStamp(b))
}

/** Gives changed or new items the time of this save. Unchanged items keep their stamp. */
export function stampItems<T extends Stamped>(prev: T[], next: T[], now: string): T[] {
  const before = new Map(prev.map((item) => [item.id, item]))
  return next.map((item) => {
    const old = before.get(item.id)
    if (old && sameContent(old, item)) return { ...item, updatedAt: old.updatedAt ?? now }
    return { ...item, updatedAt: now }
  })
}

/** Ids that left a list get a tombstone with this save's time. Ids that came back lose theirs. */
export function tombstoneRemoved(tombs: Record<string, string>, prevIds: string[], nextIds: string[], now: string): Record<string, string> {
  const out = { ...tombs }
  const kept = new Set(nextIds)
  for (const id of nextIds) delete out[id]
  for (const id of prevIds) if (!kept.has(id)) out[id] = now
  return out
}

function stamps(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

export function readTombstones(raw: unknown): Tombstones {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { plans: stamps(row.plans), sessions: stamps(row.sessions) }
}

export function loadTombstones(profileId: string): Tombstones {
  try {
    const raw = localStorage.getItem(profileKey(TOMBSTONES_KEY, profileId))
    return raw ? readTombstones(JSON.parse(raw)) : NO_TOMBSTONES
  } catch {
    return NO_TOMBSTONES
  }
}

export function storeTombstones(profileId: string, tombstones: Tombstones): void {
  try {
    localStorage.setItem(profileKey(TOMBSTONES_KEY, profileId), JSON.stringify(tombstones))
  } catch {
    /* the removals still apply for this visit */
  }
}
