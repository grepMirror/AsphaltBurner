import { normalizeSport } from './format'
import { DEFAULT_PROFILE_ID, garminKeyOf, type Profile } from './profiles'
import { sportFromType } from './strava'
import type { Activity, GarminState, ImportReport } from '../types'

export type SavedBundle = {
  activities: Activity[]
  report: ImportReport | null
}

const DB_NAME = 'asphaltburner'
const STORE = 'bundle'
/** The activities every local profile shares. */
const SHARED_KEY = 'v2'

/** A profile loaded from Drive reads its own activities. Every other profile reads the shared bundle. */
export function bundleKeyOf(profile: Pick<Profile, 'id' | 'ownBundle'>): string {
  return profile.ownBundle ? `bundle:${profile.id}` : SHARED_KEY
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const pending = run(db.transaction(STORE, mode).objectStore(STORE))
        pending.onsuccess = () => resolve(pending.result)
        pending.onerror = () => reject(pending.error)
      }),
  )
}

export async function loadBundle(key: string = SHARED_KEY): Promise<SavedBundle | null> {
  const bundle = (await request<SavedBundle | undefined>('readonly', (store) => store.get(key))) ?? null
  if (!bundle) return null
  return {
    ...bundle,
    // Re-derive from the type, so rows saved before a mapping fix (hiking counted as run) are corrected.
    activities: bundle.activities.map((activity) => ({
      ...activity,
      sport: activity.type ? sportFromType(activity.type) : normalizeSport(String(activity.sport)),
    })),
  }
}

export async function saveBundle(bundle: SavedBundle, key: string = SHARED_KEY): Promise<void> {
  await request('readwrite', (store) => store.put(bundle, key))
}

export async function clearBundle(key: string = SHARED_KEY): Promise<void> {
  await request('readwrite', (store) => store.delete(key))
}

/** The Strava zip as it was imported. Kept so the archive can be backed up to Drive without media. */
export async function saveZip(blob: Blob, key: string = SHARED_KEY): Promise<void> {
  await request('readwrite', (store) => store.put(blob, `zip:${key}`))
}

export async function loadZip(key: string = SHARED_KEY): Promise<Blob | null> {
  return (await request<Blob | undefined>('readonly', (store) => store.get(`zip:${key}`))) ?? null
}

export async function clearZip(key: string = SHARED_KEY): Promise<void> {
  await request('readwrite', (store) => store.delete(`zip:${key}`))
}

/** Garmin key and sync progress live under their own key per profile, apart from the activity bundle. */
export async function loadGarmin(profileId: string = DEFAULT_PROFILE_ID): Promise<GarminState | null> {
  return (await request<GarminState | undefined>('readonly', (store) => store.get(garminKeyOf(profileId)))) ?? null
}

export async function saveGarmin(state: GarminState, profileId: string = DEFAULT_PROFILE_ID): Promise<void> {
  await request('readwrite', (store) => store.put(state, garminKeyOf(profileId)))
}

export async function clearGarmin(profileId: string = DEFAULT_PROFILE_ID): Promise<void> {
  await request('readwrite', (store) => store.delete(garminKeyOf(profileId)))
}
