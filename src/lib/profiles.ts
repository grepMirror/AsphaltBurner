import { DEFAULT_MAX_HR, DEFAULT_REST_HR, DEFAULT_ZONES, clampMaxHr, clampRestHr, clampZones, loadMaxHr, loadRestHr, loadZones, type HrMethod, type ZoneEdges } from './intensity'

/** Heart-rate settings of the profile. */
export type HrSettings = {
  maxHr: number
  restHr: number
  method: HrMethod
  zones: ZoneEdges
}

/** The Google Drive file a profile is saved to. Only the link is kept here, never a token. */
export type DriveLink = {
  fileId: string
  /** Drive version the local copy last matched. */
  lastVersion: string | null
  lastSyncAt: string | null
  /** False when the file is only shared as viewer: the profile is read-only. */
  canEdit: boolean
  /** The Strava archive file in Drive, once it was backed up or restored. */
  archiveId: string | null
  /** Name of the Drive folder that holds the profile file. `My Drive` when it is at the root. */
  folderName: string | null
}

/**
 * The profile is a name, heart-rate settings, the connectors login and, when saved, a Drive file.
 * The app keeps one profile. The list shape stays so the stored keys and the Drive file do not change.
 */
export type Profile = HrSettings & {
  id: string
  name: string
  /** When the name or heart-rate settings last changed. Drive keeps the newer side. */
  settingsAt?: string
  drive?: DriveLink
  /** Left by an earlier version: the activities are kept in this profile's own bundle, not the shared one. */
  ownBundle?: boolean
}

export type ProfileBook = {
  profiles: Profile[]
  activeId: string
}

/** The first profile holds the settings and the Garmin login saved before profiles existed. */
export const DEFAULT_PROFILE_ID = 'main'
export const NAME_MAX = 40
export const DEFAULT_NAME = 'My profile'

const KEY = 'asphaltburner.profiles.v1'
// Keys used before profiles existed. Read once to build the first profile.
const LEGACY_METHOD_KEY = 'asphaltburner.hrMethod'

/** Karvonen is the default. `% max` is kept only when it was chosen on purpose. */
export function defaultHr(): HrSettings {
  return { maxHr: DEFAULT_MAX_HR, restHr: DEFAULT_REST_HR, method: 'karvonen', zones: DEFAULT_ZONES }
}

export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
}

export function cleanHr(raw: Partial<Record<keyof HrSettings, unknown>>): HrSettings {
  const base = defaultHr()
  return {
    maxHr: typeof raw.maxHr === 'number' ? clampMaxHr(raw.maxHr) : base.maxHr,
    restHr: typeof raw.restHr === 'number' ? clampRestHr(raw.restHr) : base.restHr,
    method: raw.method === 'max' ? 'max' : 'karvonen',
    zones: Array.isArray(raw.zones) ? clampZones(raw.zones.map(Number)) : base.zones,
  }
}

function nowStamp(): string {
  return new Date().toISOString()
}

function cleanStamp(raw: unknown): string | undefined {
  return typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? raw : undefined
}

function cleanLink(raw: unknown): DriveLink | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  if (typeof row.fileId !== 'string' || !row.fileId) return undefined
  return {
    fileId: row.fileId,
    lastVersion: typeof row.lastVersion === 'string' ? row.lastVersion : null,
    lastSyncAt: cleanStamp(row.lastSyncAt) ?? null,
    canEdit: row.canEdit !== false,
    archiveId: typeof row.archiveId === 'string' && row.archiveId ? row.archiveId : null,
    folderName: typeof row.folderName === 'string' && row.folderName ? row.folderName : null,
  }
}

export function cleanProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = cleanName(row.name)
  if (!id || !name) return null
  const profile: Profile = { id, name, ...cleanHr(row) }
  const settingsAt = cleanStamp(row.settingsAt)
  if (settingsAt) profile.settingsAt = settingsAt
  const drive = cleanLink(row.drive)
  if (drive) profile.drive = drive
  if (row.ownBundle === true) profile.ownBundle = true
  return profile
}

/** Valid profiles only, one per id, and an active id that exists. `null` when nothing usable is left. */
export function normalizeBook(raw: unknown): ProfileBook | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as { profiles?: unknown; activeId?: unknown }
  if (!Array.isArray(row.profiles)) return null
  const seen = new Set<string>()
  const profiles: Profile[] = []
  for (const item of row.profiles) {
    const profile = cleanProfile(item)
    if (!profile || seen.has(profile.id)) continue
    seen.add(profile.id)
    profiles.push(profile)
  }
  if (profiles.length === 0) return null
  return { profiles, activeId: typeof row.activeId === 'string' && seen.has(row.activeId) ? row.activeId : profiles[0].id }
}

/** First profile, built from the settings saved before profiles existed. */
function migrated(): ProfileBook {
  let method: HrMethod = 'karvonen'
  try {
    if (localStorage.getItem(LEGACY_METHOD_KEY) === 'max') method = 'max'
  } catch {
    /* keep the default */
  }
  const profile: Profile = { id: DEFAULT_PROFILE_ID, name: DEFAULT_NAME, maxHr: loadMaxHr(), restHr: loadRestHr(), method, zones: loadZones() }
  return { profiles: [profile], activeId: profile.id }
}

export function loadProfiles(): ProfileBook {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const book = normalizeBook(JSON.parse(raw))
      if (book) return book
    }
  } catch {
    /* fall through to the migration */
  }
  return saveProfiles(migrated())
}

export function saveProfiles(book: ProfileBook): ProfileBook {
  try {
    localStorage.setItem(KEY, JSON.stringify(book))
  } catch {
    /* the profiles still apply for this visit */
  }
  return book
}

export function activeProfile(book: ProfileBook): Profile {
  return book.profiles.find((profile) => profile.id === book.activeId) ?? book.profiles[0]
}

/** Back to the first state: default name and heart rate, no Drive link. The id stays, so the stored data keeps its keys. */
export function resetProfile(book: ProfileBook, id: string): ProfileBook {
  return {
    ...book,
    profiles: book.profiles.map((profile) =>
      profile.id === id ? { id, name: DEFAULT_NAME, ...defaultHr(), ...(profile.ownBundle ? { ownBundle: true } : {}) } : profile,
    ),
  }
}

/** An empty name is ignored, so a profile always has one. */
export function renameProfile(book: ProfileBook, id: string, name: string): ProfileBook {
  const clean = cleanName(name)
  if (!clean) return book
  return { ...book, profiles: book.profiles.map((profile) => (profile.id === id ? { ...profile, name: clean, settingsAt: nowStamp() } : profile)) }
}

export function updateHr(book: ProfileBook, id: string, patch: Partial<HrSettings>): ProfileBook {
  return {
    ...book,
    profiles: book.profiles.map((profile) => (profile.id === id ? { ...profile, ...cleanHr({ ...profile, ...patch }), settingsAt: nowStamp() } : profile)),
  }
}

/** Sets the Drive file of one profile. `null` unlinks it and keeps the local data. */
export function setDriveLink(book: ProfileBook, id: string, link: DriveLink | null): ProfileBook {
  return { ...book, profiles: book.profiles.map((profile) => (profile.id === id ? { ...profile, drive: link ?? undefined } : profile)) }
}

/** Gives a profile the time of its settings when it has none yet, so Drive can tell it apart from a newer copy. */
export function stampSettings(book: ProfileBook, id: string, at: string): ProfileBook {
  return { ...book, profiles: book.profiles.map((profile) => (profile.id === id && !profile.settingsAt ? { ...profile, settingsAt: at } : profile)) }
}

/** Name and heart-rate settings taken from another copy, kept with the time they were set. */
export function applySettings(book: ProfileBook, id: string, settings: HrSettings & { name: string }, at: string): ProfileBook {
  return {
    ...book,
    profiles: book.profiles.map((profile) =>
      profile.id === id ? { ...profile, ...cleanHr(settings), name: cleanName(settings.name) || profile.name, settingsAt: at || undefined } : profile,
    ),
  }
}

/** Where a profile's Garmin login is kept. The first profile keeps the key used before profiles existed. */
export function garminKeyOf(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? 'garmin' : `garmin:${profileId}`
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('profiles.ts')) {
  const base: ProfileBook = { profiles: [{ id: DEFAULT_PROFILE_ID, name: 'My profile', ...defaultHr() }], activeId: DEFAULT_PROFILE_ID }

  // rename: empty keeps the old name
  if (renameProfile(base, DEFAULT_PROFILE_ID, '   ').profiles[0].name !== DEFAULT_NAME) throw new Error('rename empty')
  if (renameProfile(base, DEFAULT_PROFILE_ID, ' Mael ').profiles[0].name !== 'Mael') throw new Error('rename')
  if (renameProfile(base, DEFAULT_PROFILE_ID, 'x'.repeat(100)).profiles[0].name.length !== NAME_MAX) throw new Error('name max')

  // heart rate is clamped
  const tuned = updateHr(base, DEFAULT_PROFILE_ID, { maxHr: 185, restHr: 48, method: 'max' })
  if (tuned.profiles[0].maxHr !== 185 || tuned.profiles[0].restHr !== 48 || tuned.profiles[0].method !== 'max') throw new Error('hr')
  if (updateHr(base, DEFAULT_PROFILE_ID, { maxHr: 5000 }).profiles[0].maxHr !== clampMaxHr(5000)) throw new Error('hr clamp')

  // reset: default name and heart rate, no link, no settings stamp, same id
  const used: ProfileBook = {
    ...tuned,
    profiles: [{ ...tuned.profiles[0], name: 'Mael', settingsAt: '2026-01-01T00:00:00.000Z', drive: { fileId: 'f', lastVersion: null, lastSyncAt: null, canEdit: true, archiveId: null, folderName: null } }],
  }
  const fresh = resetProfile(used, DEFAULT_PROFILE_ID).profiles[0]
  if (fresh.id !== DEFAULT_PROFILE_ID || fresh.name !== DEFAULT_NAME || fresh.maxHr !== DEFAULT_MAX_HR || fresh.method !== 'karvonen' || fresh.drive || fresh.settingsAt) throw new Error('reset')

  // normalize: bad rows dropped, duplicates dropped, bad active id repaired, bad numbers clamped
  const messy = normalizeBook({
    activeId: 'gone',
    profiles: [{ id: 'a', name: 'A', maxHr: 9999, restHr: 'x', method: 'max', zones: [1, 2] }, { id: 'a', name: 'Again' }, { id: '', name: 'No id' }, { id: 'b', name: '   ' }, null, 3],
  })
  if (!messy || messy.profiles.length !== 1 || messy.activeId !== 'a') throw new Error('normalize')
  if (messy.profiles[0].maxHr !== clampMaxHr(9999) || messy.profiles[0].restHr !== DEFAULT_REST_HR || messy.profiles[0].method !== 'max') throw new Error('normalize values')
  if (normalizeBook({ profiles: [] }) !== null || normalizeBook(null) !== null || normalizeBook('x') !== null) throw new Error('normalize empty')

  // Garmin key: the first profile keeps the old key
  if (garminKeyOf(DEFAULT_PROFILE_ID) !== 'garmin' || garminKeyOf('profile-abc') !== 'garmin:profile-abc') throw new Error('garmin key')

  console.log('SELFTEST profiles OK')
}
