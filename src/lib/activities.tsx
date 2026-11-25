import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { localDayKey } from './calendar'
import { connectGarmin as createGarminState, syncGarmin as runGarminSync } from './garmin'
import { clearBundle, clearGarmin, clearZip, loadBundle, loadGarmin, saveBundle, saveGarmin, saveZip, type SavedBundle } from './store'
import { readStravaZip, type ImportProgress } from './strava'
import type { Activity, GarminState, ImportReport } from '../types'

type ActivitiesContextValue = {
  ready: boolean
  activities: Activity[]
  report: ImportReport | null
  progress: ImportProgress | null
  error: string | null
  importFile: (file: File | undefined) => void
  /** Reads a Strava zip blob into the activities of the active profile, the same way a zip import does. */
  importArchive: (file: Blob) => Promise<void>
  clear: () => void
  /** Garmin login of the active profile. */
  garmin: GarminState | null
  /** The active profile is syncing. */
  garminSyncing: boolean
  /** Some profile is syncing. Only one sync runs at a time. */
  garminBusy: boolean
  garminError: string | null
  connectGarmin: (apiKey: string) => Promise<void>
  syncGarmin: () => Promise<void>
  disconnectGarmin: () => Promise<void>
  /** Drop the Garmin login of a profile that is being deleted. */
  forgetProfile: (profileId: string) => Promise<void>
}

const ActivitiesContext = createContext<ActivitiesContextValue | null>(null)

/** Days that have a zip session. Garmin rows on those days are never loaded or kept. */
function zipDaysOf(activities: Activity[]): Set<string> {
  const days = new Set<string>()
  for (const activity of activities) {
    if (activity.source === 'garmin') continue
    const day = localDayKey(activity.date)
    if (day) days.add(day)
  }
  return days
}

/**
 * Activities are shared by every local profile. A profile saved to Drive has its own `bundleKey`,
 * so its activities are loaded from its own bundle. The Garmin login is per profile:
 * `profileId` picks the one that is loaded, shown and synced.
 */
export function ActivitiesProvider({ profileId, profileIds, bundleKey, children }: { profileId: string; profileIds: string[]; bundleKey: string; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [garmin, setGarmin] = useState<GarminState | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [garminError, setGarminError] = useState<string | null>(null)

  // Refs hold the latest values for async work (sync runs for minutes).
  const bundleRef = useRef<SavedBundle>({ activities: [], report: null })
  const bundleKeyRef = useRef(bundleKey)
  const garminRef = useRef<GarminState | null>(null)
  const profileRef = useRef(profileId)
  const profileIdsRef = useRef(profileIds)
  const syncingRef = useRef<string | null>(null)
  // Profiles whose login was removed while a sync was still running. Their progress is not saved again.
  const droppedRef = useRef(new Set<string>())
  profileIdsRef.current = profileIds
  bundleKeyRef.current = bundleKey

  const persist = useCallback(async (next: SavedBundle) => {
    bundleRef.current = next
    setActivities(next.activities)
    setReport(next.report)
    await saveBundle(next, bundleKeyRef.current)
  }, [])

  /** Saves the progress of one profile. The screen only follows it while that profile is the active one. */
  const saveGarminState = useCallback(async (id: string, next: GarminState) => {
    if (droppedRef.current.has(id)) return
    if (profileRef.current === id) {
      garminRef.current = next
      setGarmin(next)
    }
    await saveGarmin(next, id)
  }, [])

  const runSync = useCallback(async () => {
    const id = profileRef.current
    const state = garminRef.current
    if (!state || syncingRef.current !== null) return
    syncingRef.current = id
    setSyncingId(id)
    setGarminError(null)
    try {
      await runGarminSync(state, {
        zipDays: zipDaysOf(bundleRef.current.activities),
        known: new Set(bundleRef.current.activities.map((activity) => activity.id)),
        add: (batch) => persist({ activities: [...bundleRef.current.activities, ...batch], report: bundleRef.current.report }),
        saveState: (next) => saveGarminState(id, next),
      })
    } catch (cause) {
      if (profileRef.current === id) setGarminError(cause instanceof Error ? cause.message : 'Garmin sync failed.')
    } finally {
      syncingRef.current = null
      setSyncingId(null)
    }
  }, [persist, saveGarminState])

  // The bundle follows the active profile. Switching profile loads that profile's activities.
  useEffect(() => {
    let cancelled = false
    bundleRef.current = { activities: [], report: null }
    setActivities([])
    setReport(null)
    setError(null)
    loadBundle(bundleKey)
      .then((bundle) => {
        if (cancelled) return
        bundleRef.current = {
          activities: (bundle?.activities ?? []).map((activity) => ({ ...activity, stream: activity.stream ?? [] })),
          report: bundle?.report ?? null,
        }
        setActivities(bundleRef.current.activities)
        setReport(bundleRef.current.report)
      })
      .catch(() => {
        if (!cancelled) setError('Saved sessions could not be opened. You can import the zip again.')
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [bundleKey])

  // The Garmin login follows the profile. It loads after the activities, so a sync sees what is already known.
  useEffect(() => {
    profileRef.current = profileId
    garminRef.current = null
    setGarmin(null)
    setGarminError(null)
    if (!ready) return
    let cancelled = false
    loadGarmin(profileId)
      .then((state) => {
        if (cancelled || !state) return
        garminRef.current = state
        setGarmin(state)
        void runSync()
      })
      .catch(() => {
        if (!cancelled) setGarminError('The saved Garmin login could not be opened.')
      })
    return () => {
      cancelled = true
    }
  }, [profileId, ready, runSync])

  /** The zip replaces the archive of the active profile. Garmin rows survive only on days the zip does not cover. */
  const importArchive = useCallback(
    async (file: Blob) => {
      const key = bundleKeyRef.current
      const result = await readStravaZip(file, setProgress, 'zip')
      const zipDays = zipDaysOf(result.activities)
      const kept = bundleRef.current.activities.filter((activity) => {
        if (activity.source !== 'garmin') return false
        const day = localDayKey(activity.date)
        return day !== null && !zipDays.has(day)
      })
      await saveZip(file, key)
      await persist({ activities: [...result.activities, ...kept], report: result.report })
    },
    [persist],
  )

  const importFile = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.zip')) {
        setError('Choose a Strava export .zip file.')
        return
      }
      setError(null)
      setProgress({ done: 0, total: 1, label: 'Opening zip' })
      void importArchive(file)
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'The zip could not be read.')
        })
        .finally(() => {
          setProgress(null)
        })
    },
    [importArchive],
  )

  const clear = useCallback(() => {
    void clearBundle(bundleKeyRef.current)
    void clearZip(bundleKeyRef.current)
    bundleRef.current = { activities: [], report: null }
    setActivities([])
    setReport(null)
    setError(null)
    // Garmin progress describes the bundle that was just removed; every profile starts its history over.
    for (const id of profileIdsRef.current) {
      void loadGarmin(id).then((state) => {
        if (state) return saveGarminState(id, { ...state, newestDay: null, oldestDay: null, historyComplete: false, lastSync: null })
      })
    }
  }, [saveGarminState])

  const connectGarmin = useCallback(
    async (apiKey: string) => {
      const trimmed = apiKey.trim()
      if (!trimmed) throw new Error('Paste the Personal API key from Garmin Connect.')
      const id = profileRef.current
      const state = await createGarminState(trimmed)
      await saveGarmin(state, id)
      droppedRef.current.delete(id)
      // The login is saved for that profile even if another one is showing by now.
      if (profileRef.current !== id) return
      garminRef.current = state
      setGarmin(state)
      setGarminError(null)
      void runSync()
    },
    [runSync],
  )

  const disconnectGarmin = useCallback(async () => {
    const id = profileRef.current
    droppedRef.current.add(id)
    garminRef.current = null
    setGarmin(null)
    setGarminError(null)
    await clearGarmin(id)
  }, [])

  const forgetProfile = useCallback(async (id: string) => {
    droppedRef.current.add(id)
    await clearGarmin(id)
  }, [])

  return (
    <ActivitiesContext.Provider
      value={{
        ready,
        activities,
        report,
        progress,
        error,
        importFile,
        importArchive,
        clear,
        garmin,
        garminSyncing: syncingId === profileId,
        garminBusy: syncingId !== null,
        garminError,
        connectGarmin,
        syncGarmin: runSync,
        disconnectGarmin,
        forgetProfile,
      }}
    >
      {children}
    </ActivitiesContext.Provider>
  )
}

export function useActivities(): ActivitiesContextValue {
  const value = useContext(ActivitiesContext)
  if (!value) throw new Error('useActivities must be used inside ActivitiesProvider')
  return value
}
