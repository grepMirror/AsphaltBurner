import { normalizePlan, loadPlan, storePlan, type PlannedSession } from '../plan'
import { normalizeBook as normalizePlanBook, loadBook, storeBook, type PlanInfo } from '../plans'
import { normalizeBlocks, loadBlocks, storeBlocks, type BlockBook } from '../blocks'
import { cleanProfile, type HrSettings, type Profile } from '../profiles'
import { loadTombstones, NO_TOMBSTONES, readTombstones, stableJson, storeTombstones, type Tombstones } from '../stamp'

/** Name of the profile file in Drive. */
export const PROFILE_FILE = 'asphaltburner-profile.json'
/** Name of the Strava archive file in Drive. */
export const ARCHIVE_FILE = 'asphaltburner-strava-archive.zip'

const SCHEMA = 1

export type DocSettings = HrSettings & {
  name: string
  /** When the settings last changed. Empty when they never did. */
  settingsAt: string
}

/** One profile as stored in Drive: its settings, plans, sessions, week tags and removals. Never a token or key. */
export type ProfileDoc = {
  schema: typeof SCHEMA
  updatedAt: string
  settings: DocSettings
  plans: PlanInfo[]
  sessions: PlannedSession[]
  blocks: BlockBook
  tombstones: Tombstones
}

/** Reads a document from Drive. `null` when the content is not an AsphaltBurner profile. */
export function readDoc(raw: unknown): ProfileDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.schema !== SCHEMA) return null
  const settings = row.settings && typeof row.settings === 'object' ? (row.settings as Record<string, unknown>) : {}
  const profile = cleanProfile({ ...settings, id: 'document' })
  if (!profile) return null
  return {
    schema: SCHEMA,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    settings: {
      name: profile.name,
      maxHr: profile.maxHr,
      restHr: profile.restHr,
      method: profile.method,
      zones: profile.zones,
      settingsAt: typeof settings.settingsAt === 'string' ? settings.settingsAt : '',
    },
    plans: normalizePlanBook({ plans: row.plans, activeId: null }).plans,
    sessions: normalizePlan(row.sessions),
    blocks: normalizeBlocks(row.blocks),
    tombstones: readTombstones(row.tombstones),
  }
}

/** The document of the local profile as it is now. */
export function buildDoc(profileId: string, profile: Profile, now: string): ProfileDoc {
  return {
    schema: SCHEMA,
    updatedAt: now,
    settings: {
      name: profile.name,
      maxHr: profile.maxHr,
      restHr: profile.restHr,
      method: profile.method,
      zones: profile.zones,
      settingsAt: profile.settingsAt ?? '',
    },
    plans: loadBook(profileId).plans,
    sessions: loadPlan(profileId),
    blocks: loadBlocks(profileId),
    tombstones: loadTombstones(profileId),
  }
}

/** Two documents with the same content, ignoring when they were written. */
export function sameDoc(a: ProfileDoc, b: ProfileDoc): boolean {
  return stableJson({ ...a, updatedAt: '' }) === stableJson({ ...b, updatedAt: '' })
}

function newestStamps(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out = { ...a }
  for (const [id, at] of Object.entries(b)) if (!out[id] || at > out[id]) out[id] = at
  return out
}

/**
 * One item per id: the copy changed last wins. A removal wins over a copy that is not newer than it.
 * Items keep the order of the local list, then the ones only the other side has.
 */
function mergeById<T extends { id: string; updatedAt?: string }>(local: T[], remote: T[], removed: Record<string, string>): T[] {
  const best = new Map<string, T>()
  for (const item of [...local, ...remote]) {
    const old = best.get(item.id)
    if (!old || (item.updatedAt ?? '') > (old.updatedAt ?? '')) best.set(item.id, item)
  }
  return [...best.values()].filter((item) => !(removed[item.id] && removed[item.id] >= (item.updatedAt ?? '')))
}

/**
 * Merge of two copies of one profile. Plans and sessions merge by id, the newer copy wins.
 * The week-tag book and the settings are each taken whole from the side that changed last.
 */
export function mergeDocs(local: ProfileDoc, remote: ProfileDoc, now: string): ProfileDoc {
  const tombstones: Tombstones = {
    plans: newestStamps(local.tombstones.plans, remote.tombstones.plans),
    sessions: newestStamps(local.tombstones.sessions, remote.tombstones.sessions),
  }
  return {
    schema: SCHEMA,
    updatedAt: now,
    settings: remote.settings.settingsAt > local.settings.settingsAt ? remote.settings : local.settings,
    plans: mergeById(local.plans, remote.plans, tombstones.plans),
    sessions: mergeById(local.sessions, remote.sessions, tombstones.sessions),
    blocks: (remote.blocks.updatedAt ?? '') > (local.blocks.updatedAt ?? '') ? remote.blocks : local.blocks,
    tombstones,
  }
}

/** Writes a document into the local storage of a profile, keeping the local active plan. */
export function applyDoc(profileId: string, doc: ProfileDoc): void {
  storeBook(profileId, { plans: doc.plans, activeId: loadBook(profileId).activeId })
  storePlan(profileId, doc.sessions)
  storeBlocks(profileId, doc.blocks)
  storeTombstones(profileId, doc.tombstones ?? NO_TOMBSTONES)
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('profileDoc.ts')) {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 10, minute)).toISOString()
  const base: ProfileDoc = {
    schema: SCHEMA,
    updatedAt: '',
    settings: { name: 'Mael', maxHr: 190, restHr: 50, method: 'karvonen', zones: [60, 70, 80, 90], settingsAt: at(1) },
    plans: [{ id: 'a', name: 'Base', objective: '', raceDate: null, createdBy: '', updatedAt: at(1) }],
    sessions: [],
    blocks: { custom: [], tags: {} },
    tombstones: NO_TOMBSTONES,
  }
  const session = (id: string, minute: number, tag: PlannedSession['tag'] = 'ef'): PlannedSession => ({
    id,
    planId: 'a',
    week: '2026-11-23',
    sport: 'run',
    tag,
    blocks: [],
    status: 'planned',
    activityId: null,
    updatedAt: at(minute),
  })

  // a copy that exists on one side only is kept
  const onlyRemote = mergeDocs({ ...base, plans: [] }, { ...base, sessions: [session('s1', 5)] }, at(9))
  if (onlyRemote.sessions.length !== 1 || onlyRemote.plans.length !== 1) throw new Error('merge keeps one-sided items')

  // the newer copy of the same id wins
  const newer = mergeDocs({ ...base, sessions: [session('s1', 2, 'ef')] }, { ...base, sessions: [session('s1', 5, 'vma')] }, at(9))
  if (newer.sessions[0].tag !== 'vma') throw new Error('merge newer wins')
  const older = mergeDocs({ ...base, sessions: [session('s1', 5, 'vma')] }, { ...base, sessions: [session('s1', 2, 'ef')] }, at(9))
  if (older.sessions[0].tag !== 'vma') throw new Error('merge older loses')

  // a removal newer than the copy deletes it, a copy edited after the removal comes back
  const removed = mergeDocs({ ...base, sessions: [session('s1', 2)] }, { ...base, tombstones: { plans: {}, sessions: { s1: at(6) } } }, at(9))
  if (removed.sessions.length !== 0) throw new Error('removal wins')
  const back = mergeDocs({ ...base, sessions: [session('s1', 8, 'long')] }, { ...base, tombstones: { plans: {}, sessions: { s1: at(6) } } }, at(9))
  if (back.sessions.length !== 1 || back.tombstones.sessions.s1 !== at(6)) throw new Error('edit after removal comes back')

  // settings and week tags: the side changed last wins as a whole
  const mine = { ...base, settings: { ...base.settings, name: 'Mael B', settingsAt: at(7) } }
  const theirs = { ...base, settings: { ...base.settings, maxHr: 185, settingsAt: at(3) } }
  const settled = mergeDocs(mine, theirs, at(9))
  if (settled.settings.name !== 'Mael B' || settled.settings.maxHr !== 190) throw new Error('settings newer wins whole')
  const tagged = mergeDocs({ ...base, blocks: { custom: [], tags: { a: { '2026-11-23': 'vma' } }, updatedAt: at(4) } }, { ...base, blocks: { custom: [], tags: {}, updatedAt: at(2) } }, at(9))
  if (Object.keys(tagged.blocks.tags).length !== 1) throw new Error('blocks newer wins whole')

  // read: junk is rejected, a valid document round-trips through the same merge
  if (readDoc(null) !== null || readDoc({ schema: 2 }) !== null || readDoc({ schema: 1, settings: { name: '' } }) !== null) throw new Error('readDoc rejects junk')
  const parsed = readDoc(JSON.parse(JSON.stringify(base)))
  if (!parsed || parsed.settings.name !== 'Mael' || parsed.plans[0].createdBy !== '') throw new Error('readDoc round trip')
  if (!sameDoc(parsed, base) || sameDoc(mine, base)) throw new Error('sameDoc')

  console.log('SELFTEST profileDoc OK')
}
