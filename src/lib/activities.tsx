import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { localDayKey } from './calendar'
import { connectGarmin as createGarminState, syncGarmin as runGarminSync } from './garmin'
import { clearBundle, clearGarmin, loadBundle, loadGarmin, saveBundle, saveGarmin, type SavedBundle } from './store'
import { readStravaZip, type ImportProgress } from './strava'
import type { Activity, GarminState, ImportReport } from '../types'

type ActivitiesContextValue = {
  ready: boolean
  activities: Activity[]
  report: ImportReport | null
  progress: ImportProgress | null
  error: string | null
  importFile: (file: File | undefined) => void
  clear: () => void
  garmin: GarminState | null
  garminSyncing: boolean
  garminError: string | null
  connectGarmin: (apiKey: string) => Promise<void>
  syncGarmin: () => Promise<void>
  disconnectGarmin: () => Promise<void>
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

export function ActivitiesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [garmin, setGarmin] = useState<GarminState | null>(null)
  const [garminSyncing, setGarminSyncing] = useState(false)
  const [garminError, setGarminError] = useState<string | null>(null)

  // Refs hold the latest values for async work (sync runs for minutes).
  const bundleRef = useRef<SavedBundle>({ activities: [], report: null })
  const garminRef = useRef<GarminState | null>(null)
  const syncingRef = useRef(false)

  const persist = useCallback(async (next: SavedBundle) => {
    bundleRef.current = next
    setActivities(next.activities)
    setReport(next.report)
    await saveBundle(next)
  }, [])

  const saveGarminState = useCallback(async (next: GarminState) => {
    if (!garminRef.current) return
    garminRef.current = next
    setGarmin(next)
    await saveGarmin(next)
  }, [])

  const runSync = useCallback(async () => {
    const state = garminRef.current
    if (!state || syncingRef.current) return
    syncingRef.current = true
    setGarminSyncing(true)
    setGarminError(null)
    try {
      await runGarminSync(state, {
        zipDays: zipDaysOf(bundleRef.current.activities),
        known: new Set(bundleRef.current.activities.map((activity) => activity.id)),
        add: (batch) => persist({ activities: [...bundleRef.current.activities, ...batch], report: bundleRef.current.report }),
        saveState: saveGarminState,
      })
    } catch (cause) {
      setGarminError(cause instanceof Error ? cause.message : 'Garmin sync failed.')
    } finally {
      syncingRef.current = false
      setGarminSyncing(false)
    }
  }, [persist, saveGarminState])

  useEffect(() => {
    let cancelled = false
    Promise.all([loadBundle(), loadGarmin()])
      .then(([bundle, garminState]) => {
        if (cancelled) return
        if (bundle) {
          bundleRef.current = {
            activities: bundle.activities.map((activity) => ({ ...activity, stream: activity.stream ?? [] })),
            report: bundle.report,
          }
          setActivities(bundleRef.current.activities)
          setReport(bundle.report)
        }
        if (garminState) {
          garminRef.current = garminState
          setGarmin(garminState)
          void runSync()
        }
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
  }, [runSync])

  const importFile = useCallback((file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Choose a Strava export .zip file.')
      return
    }
    setError(null)
    setProgress({ done: 0, total: 1, label: 'Opening zip' })
    void readStravaZip(file, setProgress, 'zip')
      .then(async (result) => {
        // The zip replaces the archive. Garmin rows survive only on days the zip does not cover.
        const zipDays = zipDaysOf(result.activities)
        const kept = bundleRef.current.activities.filter((activity) => {
          if (activity.source !== 'garmin') return false
          const day = localDayKey(activity.date)
          return day !== null && !zipDays.has(day)
        })
        await persist({ activities: [...result.activities, ...kept], report: result.report })
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The zip could not be read.')
      })
      .finally(() => {
        setProgress(null)
      })
  }, [persist])

  const clear = useCallback(() => {
    void clearBundle()
    bundleRef.current = { activities: [], report: null }
    setActivities([])
    setReport(null)
    setError(null)
    // Garmin progress describes the bundle that was just removed; start its history over.
    const state = garminRef.current
    if (state) void saveGarminState({ ...state, newestDay: null, oldestDay: null, historyComplete: false, lastSync: null })
  }, [saveGarminState])

  const connectGarmin = useCallback(
    async (apiKey: string) => {
      const trimmed = apiKey.trim()
      if (!trimmed) throw new Error('Paste the Personal API key from Garmin Connect.')
      const state = await createGarminState(trimmed)
      await saveGarmin(state)
      garminRef.current = state
      setGarmin(state)
      setGarminError(null)
      void runSync()
    },
    [runSync],
  )

  const disconnectGarmin = useCallback(async () => {
    garminRef.current = null
    setGarmin(null)
    setGarminError(null)
    await clearGarmin()
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
        clear,
        garmin,
        garminSyncing,
        garminError,
        connectGarmin,
        syncGarmin: runSync,
        disconnectGarmin,
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
