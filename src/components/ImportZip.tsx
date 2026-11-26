import { useActivities } from '../lib/activities'

/** Reads a Strava export zip into the activities of the active profile. */
export function ImportZip() {
  const { importFile, progress, error } = useActivities()

  return (
    <div>
      <label className="inline-block cursor-pointer whitespace-nowrap rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
        {progress ? 'Importing…' : 'Import zip'}
        <input
          className="sr-only"
          type="file"
          accept=".zip,application/zip"
          disabled={progress !== null}
          onChange={(event) => {
            importFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </label>
      {progress ? (
        <p className="mt-2 text-xs text-white/70">
          Reading {progress.done}/{progress.total}
          {progress.label ? ` · ${progress.label}` : ''}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  )
}
