import { useDrive, type DriveStatus } from '../lib/drive/DriveProvider'
import { DriveIcon, FolderIcon, RefreshIcon } from './icons'

export const DRIVE_LABEL: Record<DriveStatus, string> = {
  off: 'Not synced',
  syncing: 'Syncing…',
  saved: 'Synced',
  readonly: 'View only',
  signin: 'Sign in needed',
  error: 'Problem',
}

export const DRIVE_TONE: Record<DriveStatus, string> = {
  off: 'text-white/45',
  syncing: 'text-sky-200',
  saved: 'text-emerald-300',
  readonly: 'text-amber-200',
  signin: 'text-amber-200',
  error: 'text-red-200',
}

const BUTTON = 'rounded-md border px-3 py-2 text-sm disabled:opacity-50'
const PRIMARY = `${BUTTON} border-sky-300/40 bg-sky-400/10 text-sky-100`
const QUIET = `${BUTTON} border-white/15 text-white/70 hover:text-white`
const ICON = 'grid h-9 w-9 place-items-center rounded-md border border-sky-300/40 bg-sky-400/10 text-sky-100 disabled:opacity-50'

/** Google Drive of the active profile. Signed out it only offers sign-in; signed in it syncs the profile. */
export function DriveCard() {
  const drive = useDrive()
  const { linked, status, message, signedIn } = drive
  const busy = status === 'syncing'
  const label = !signedIn ? 'Not connected' : linked ? DRIVE_LABEL[status] : 'Connected'
  const tone = !signedIn ? 'text-white/45' : linked ? DRIVE_TONE[status] : 'text-emerald-300'

  if (!drive.configured) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <DriveIcon />
          Google Drive
        </h3>
        <p className="mt-1 text-xs text-white/55">Not set up on this build. It needs VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY and VITE_GOOGLE_APP_ID.</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <DriveIcon />
          Google Drive
        </h3>
        <span className={`text-xs ${tone}`}>{label}</span>
      </div>
      {signedIn && drive.email ? <p className="mt-1 truncate text-xs text-white/70">{drive.email}</p> : null}
      {drive.archiveHint ? <p className="mt-2 text-xs text-amber-200">{drive.archiveHint}</p> : null}

      {!signedIn ? (
        <div className="mt-3">
          <button type="button" disabled={busy} onClick={() => void drive.signIn()} className={PRIMARY}>
            Sign in
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {linked ? (
            <>
              <p className="text-xs text-white/70">Folder: {linked.folderName ?? '…'}</p>
              <p className="text-xs text-white/70">Last sync: {linked.lastSyncAt ? new Date(linked.lastSyncAt).toLocaleString() : 'never'}</p>
              <p className="text-xs text-white/70">Archive: {linked.archiveId ? 'backed up in Drive' : 'not backed up'}</p>
              {linked.canEdit ? null : <p className="text-xs text-amber-200">You have view access to this file. Your changes stay on this device.</p>}
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {linked ? (
              <>
                <button type="button" disabled={busy} onClick={() => void drive.syncNow()} aria-label="Sync now" title="Sync now" className={ICON}>
                  <RefreshIcon className={busy ? 'animate-spin' : ''} />
                </button>
                <button type="button" disabled={busy} onClick={() => void drive.changeFolder()} aria-label="Change Drive folder" title="Change Drive folder" className={ICON}>
                  <FolderIcon />
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => void drive.saveToDrive()} className={PRIMARY}>
                  Sync to Drive
                </button>
              </>
            )}
            {linked ? (
              <>
                <button type="button" disabled={busy} onClick={() => void drive.backupArchive()} className={QUIET}>
                  Back up archive
                </button>
                <button type="button" disabled={busy} onClick={() => void drive.restoreArchive()} className={QUIET}>
                  Restore archive
                </button>
                <button type="button" onClick={drive.unlink} className={QUIET}>
                  Unlink
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {message ? <p className={`mt-2 text-xs ${status === 'error' || status === 'signin' ? 'text-red-200' : 'text-white/70'}`}>{message}</p> : null}
    </section>
  )
}
