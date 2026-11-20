import { normalizeSport } from './format'
import { sportFromType } from './strava'
import type { Activity, GarminState, ImportReport } from '../types'

export type SavedBundle = {
  activities: Activity[]
  report: ImportReport | null
}

const DB_NAME = 'asphaltburner'
const STORE = 'bundle'
const KEY = 'v2'
const GARMIN_KEY = 'garmin'

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

export async function loadBundle(): Promise<SavedBundle | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    request.onsuccess = () => {
      const bundle = (request.result as SavedBundle | undefined) ?? null
      if (!bundle) {
        resolve(null)
        return
      }
      resolve({
        ...bundle,
        // Re-derive from the type, so rows saved before a mapping fix (hiking counted as run) are corrected.
        activities: bundle.activities.map((activity) => ({
          ...activity,
          sport: activity.type ? sportFromType(activity.type) : normalizeSport(String(activity.sport)),
        })),
      })
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveBundle(bundle: SavedBundle): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(bundle, KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function clearBundle(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY)
    request.onsuccess = () => resolve()
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

/** Garmin key and sync progress live under their own key, apart from the activity bundle. */
export async function loadGarmin(): Promise<GarminState | null> {
  return (await request<GarminState | undefined>('readonly', (store) => store.get(GARMIN_KEY))) ?? null
}

export async function saveGarmin(state: GarminState): Promise<void> {
  await request('readwrite', (store) => store.put(state, GARMIN_KEY))
}

export async function clearGarmin(): Promise<void> {
  await request('readwrite', (store) => store.delete(GARMIN_KEY))
}
