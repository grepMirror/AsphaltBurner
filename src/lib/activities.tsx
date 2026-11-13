import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { clearBundle, loadBundle, saveBundle } from './store'
import { readStravaZip, type ImportProgress } from './strava'
import type { Activity, ImportReport } from '../types'

type ActivitiesContextValue = {
  ready: boolean
  activities: Activity[]
  report: ImportReport | null
  progress: ImportProgress | null
  error: string | null
  importFile: (file: File | undefined) => void
  clear: () => void
}

const ActivitiesContext = createContext<ActivitiesContextValue | null>(null)

export function ActivitiesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadBundle()
      .then((bundle) => {
        if (cancelled || !bundle) return
        setActivities(bundle.activities.map((activity) => ({ ...activity, stream: activity.stream ?? [] })))
        setReport(bundle.report)
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
  }, [])

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
        setActivities(result.activities)
        setReport(result.report)
        await saveBundle(result)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The zip could not be read.')
      })
      .finally(() => {
        setProgress(null)
      })
  }, [])

  const clear = useCallback(() => {
    void clearBundle()
    setActivities([])
    setReport(null)
    setError(null)
  }, [])

  return (
    <ActivitiesContext.Provider value={{ ready, activities, report, progress, error, importFile, clear }}>
      {children}
    </ActivitiesContext.Provider>
  )
}

export function useActivities(): ActivitiesContextValue {
  const value = useContext(ActivitiesContext)
  if (!value) throw new Error('useActivities must be used inside ActivitiesProvider')
  return value
}
