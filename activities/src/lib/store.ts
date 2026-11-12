import { normalizeSport } from './format'
import type { Activity, ImportReport } from '../types'

export type SavedBundle = {
  activities: Activity[]
  report: ImportReport | null
}

const DB_NAME = 'enduraw-activities'
const STORE = 'bundle'
const KEY = 'v2'

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
        activities: bundle.activities.map((activity) => ({ ...activity, sport: normalizeSport(String(activity.sport)) })),
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
