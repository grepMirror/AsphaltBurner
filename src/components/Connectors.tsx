import { useEffect, useState } from 'react'
import { useActivities } from '../lib/activities'
import { backendOnline } from '../lib/garmin'
import { DriveCard } from './DriveCard'
import { GarminIcon } from './icons'

/** Connectors of the active profile. Google Drive is the first card, then Garmin; more cards are added to this list. */
export function ConnectorsPanel() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void backendOnline().then((ok) => {
      if (!cancelled) setOnline(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      {online === false ? <p className="mb-3 text-xs text-red-200">Backend is not running. Connectors need it. Zip import still works.</p> : null}
      <div className="space-y-3">
        <DriveCard />
        <GarminCard />
      </div>
    </div>
  )
}

function formatDay(day: string): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number)
  return new Date(year, month - 1, dayOfMonth).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function GarminCard() {
  const { garmin, garminSyncing, garminBusy, garminError, connectGarmin, syncGarmin, disconnectGarmin } = useActivities()
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const connect = async () => {
    setConnecting(true)
    setConnectError(null)
    try {
      await connectGarmin(apiKey)
      setApiKey('')
    } catch (cause) {
      setConnectError(cause instanceof Error ? cause.message : 'Garmin could not be reached.')
    } finally {
      setConnecting(false)
    }
  }

  const history = !garmin
    ? null
    : garmin.historyComplete
      ? 'Full history loaded.'
      : garmin.oldestDay
        ? `Loaded back to ${formatDay(garmin.oldestDay)}. Sync again to continue older history.`
        : 'No history loaded yet.'

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <GarminIcon />
          Garmin
        </h3>
        <span className={`text-xs ${garmin ? 'text-emerald-300' : 'text-white/45'}`}>{garmin ? 'Connected' : 'Not connected'}</span>
      </div>
      <p className="mt-1 text-xs text-white/55">
        Your own activities through the Garmin Personal API. Days already covered by your zip are kept as they are.
      </p>

      {garmin ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-white/70">Last sync: {garmin.lastSync ? new Date(garmin.lastSync).toLocaleString() : 'never'}</p>
          {history ? <p className="text-xs text-white/70">{history}</p> : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={garminBusy}
              onClick={() => void syncGarmin()}
              className="rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100 disabled:opacity-50"
            >
              {garminSyncing ? 'Syncing…' : garminBusy ? 'Another profile is syncing' : 'Sync now'}
            </button>
            <button type="button" onClick={() => void disconnectGarmin()} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:text-white">
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!connecting) void connect()
          }}
        >
          <input
            type="password"
            aria-label="Garmin Personal API key"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Personal API key"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white/40"
          />
          <button type="submit" disabled={connecting || apiKey.trim() === ''} className="rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100 disabled:opacity-50">
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      )}

      {connectError ? <p className="mt-2 text-xs text-red-200">{connectError}</p> : null}
      {garminError ? <p className="mt-2 text-xs text-red-200">{garminError}</p> : null}
    </section>
  )
}
