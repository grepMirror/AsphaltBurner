import { DEFAULT_MAX_HR, DEFAULT_REST_HR, DEFAULT_ZONES, clampMaxHr, clampRestHr, clampZones, loadMaxHr, loadRestHr, loadZones, type HrMethod, type ZoneEdges } from './intensity'

/** Heart-rate settings. Every profile has its own. */
export type HrSettings = {
  maxHr: number
  restHr: number
  method: HrMethod
  zones: ZoneEdges
}

/**
 * A profile is a name, its heart-rate settings, and its connectors login.
 * Activities are not part of it: every profile reads the same activities.
 */
export type Profile = HrSettings & {
  id: string
  name: string
}

export type ProfileBook = {
  profiles: Profile[]
  activeId: string
}

/** The first profile holds the settings and the Garmin login saved before profiles existed. */
export const DEFAULT_PROFILE_ID = 'main'
export const NAME_MAX = 40

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

function cleanHr(raw: Partial<Record<keyof HrSettings, unknown>>): HrSettings {
  const base = defaultHr()
  return {
    maxHr: typeof raw.maxHr === 'number' ? clampMaxHr(raw.maxHr) : base.maxHr,
    restHr: typeof raw.restHr === 'number' ? clampRestHr(raw.restHr) : base.restHr,
    method: raw.method === 'max' ? 'max' : 'karvonen',
    zones: Array.isArray(raw.zones) ? clampZones(raw.zones.map(Number)) : base.zones,
  }
}

function cleanProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = cleanName(row.name)
  if (!id || !name) return null
  return { id, name, ...cleanHr(row) }
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
  const profile: Profile = { id: DEFAULT_PROFILE_ID, name: 'My profile', maxHr: loadMaxHr(), restHr: loadRestHr(), method, zones: loadZones() }
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

export function selectProfile(book: ProfileBook, id: string): ProfileBook {
  return book.profiles.some((profile) => profile.id === id) ? { ...book, activeId: id } : book
}

/** "Profile 2", "Profile 3"… the first one that no profile uses yet. */
export function nextName(book: ProfileBook): string {
  const used = new Set(book.profiles.map((profile) => profile.name.toLowerCase()))
  for (let index = book.profiles.length + 1; ; index += 1) {
    const name = `Profile ${index}`
    if (!used.has(name.toLowerCase())) return name
  }
}

/** The new profile starts from the default heart-rate settings and becomes the active one. */
export function addProfile(book: ProfileBook, name?: string): { book: ProfileBook; id: string } {
  const id = `profile-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const profile: Profile = { id, name: cleanName(name) || nextName(book), ...defaultHr() }
  return { book: { profiles: [...book.profiles, profile], activeId: id }, id }
}

/** An empty name is ignored, so a profile always has one. */
export function renameProfile(book: ProfileBook, id: string, name: string): ProfileBook {
  const clean = cleanName(name)
  if (!clean) return book
  return { ...book, profiles: book.profiles.map((profile) => (profile.id === id ? { ...profile, name: clean } : profile)) }
}

export function updateHr(book: ProfileBook, id: string, patch: Partial<HrSettings>): ProfileBook {
  return {
    ...book,
    profiles: book.profiles.map((profile) => (profile.id === id ? { ...profile, ...cleanHr({ ...profile, ...patch }) } : profile)),
  }
}

/** The last profile stays. Removing the active one activates the first of the others. */
export function removeProfile(book: ProfileBook, id: string): ProfileBook {
  if (book.profiles.length <= 1 || !book.profiles.some((profile) => profile.id === id)) return book
  const profiles = book.profiles.filter((profile) => profile.id !== id)
  return { profiles, activeId: book.activeId === id ? profiles[0].id : book.activeId }
}

/** Where a profile's Garmin login is kept. The first profile keeps the key used before profiles existed. */
export function garminKeyOf(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? 'garmin' : `garmin:${profileId}`
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('profiles.ts')) {
  const base: ProfileBook = { profiles: [{ id: DEFAULT_PROFILE_ID, name: 'My profile', ...defaultHr() }], activeId: DEFAULT_PROFILE_ID }

  // add: new profile starts from the defaults and is selected
  const added = addProfile(base)
  const second = added.book.profiles[1]
  if (added.book.profiles.length !== 2 || added.book.activeId !== added.id || second.name !== 'Profile 2' || second.method !== 'karvonen' || second.maxHr !== DEFAULT_MAX_HR) throw new Error('add')
  if (addProfile(added.book, '  Marie   Curie ').book.profiles[2].name !== 'Marie Curie') throw new Error('add name')
  if (addProfile(base, 'x'.repeat(100)).book.profiles[1].name.length !== NAME_MAX) throw new Error('name max')

  // names that already exist are skipped
  const taken = { ...added.book, profiles: [...added.book.profiles, { ...second, id: 'z', name: 'profile 3' }] }
  if (nextName(taken) !== 'Profile 4') throw new Error('next name')

  // rename: empty keeps the old name; heart rate of one profile does not touch another
  if (renameProfile(base, DEFAULT_PROFILE_ID, '   ').profiles[0].name !== 'My profile') throw new Error('rename empty')
  if (renameProfile(base, DEFAULT_PROFILE_ID, ' Mael ').profiles[0].name !== 'Mael') throw new Error('rename')
  const tuned = updateHr(added.book, added.id, { maxHr: 185, restHr: 48, method: 'max' })
  if (tuned.profiles[1].maxHr !== 185 || tuned.profiles[1].restHr !== 48 || tuned.profiles[1].method !== 'max') throw new Error('hr')
  if (tuned.profiles[0].maxHr !== DEFAULT_MAX_HR || tuned.profiles[0].method !== 'karvonen') throw new Error('hr isolation')
  if (updateHr(base, DEFAULT_PROFILE_ID, { maxHr: 5000 }).profiles[0].maxHr !== clampMaxHr(5000)) throw new Error('hr clamp')

  // select and remove
  if (selectProfile(tuned, DEFAULT_PROFILE_ID).activeId !== DEFAULT_PROFILE_ID) throw new Error('select')
  if (selectProfile(tuned, 'nope').activeId !== added.id) throw new Error('select unknown')
  if (removeProfile(base, DEFAULT_PROFILE_ID) !== base) throw new Error('last stays')
  const left = removeProfile(tuned, added.id)
  if (left.profiles.length !== 1 || left.activeId !== DEFAULT_PROFILE_ID) throw new Error('remove active')
  if (removeProfile(tuned, DEFAULT_PROFILE_ID).activeId !== added.id) throw new Error('remove other')

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
