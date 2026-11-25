import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useActivities } from '../activities'
import { CHANGE_EVENT } from '../profileData'
import { activeProfile, addProfile, applySettings, selectProfile, setDriveLink, setOwnBundle, stampSettings, type DriveLink, type ProfileBook } from '../profiles'
import { clearSession, getAccessToken, hasSession, SignInError } from '../google/auth'
import { googleConfigured } from '../google/config'
import { downloadFile, DriveError, moveFile, parentsOf, uploadFile } from '../google/drive'
import { pickDrive } from '../google/picker'
import { bundleKeyOf, loadZip } from '../store'
import { withoutMedia } from './archive'
import { ARCHIVE_FILE, applyDoc } from './profileDoc'
import { createProfileFile, readRemote, syncWithDrive } from './driveSync'

/** Off: no file. Saved: the file matches this device. Readonly: viewer access only. Signin: Google must be asked again. */
export type DriveStatus = 'off' | 'syncing' | 'saved' | 'readonly' | 'signin' | 'error'

export type DriveValue = {
  configured: boolean
  status: DriveStatus
  /** Last result or error, shown under the card. */
  message: string | null
  /** The file the active profile is saved to. */
  linked: DriveLink | null
  signedIn: boolean
  signIn: () => Promise<void>
  /** Links the profile to a new file in a folder the user picks. */
  saveToDrive: () => Promise<void>
  /** Moves the linked file, and its archive, into another folder the user picks. */
  changeFolder: () => Promise<void>
  loadFromDrive: () => Promise<void>
  syncNow: () => Promise<void>
  backupArchive: () => Promise<void>
  restoreArchive: () => Promise<void>
  unlink: () => void
}

const DriveContext = createContext<DriveValue | null>(null)
const JSON_TYPE = 'application/json'
/** Edits are sent this long after the last one. */
const PUSH_DELAY_MS = 2500

export function useDrive(): DriveValue {
  const value = useContext(DriveContext)
  if (!value) throw new Error('useDrive must be used inside DriveProvider')
  return value
}

type Props = {
  book: ProfileBook
  /** `silent` marks a change that is not an edit: linking, or a copy that came from Drive. It is not sent back. */
  onBook: (next: ProfileBook, silent: boolean) => void
  /** The local data of the active profile changed under the screen. The pages reload. */
  onPulled: () => void
  children: ReactNode
}

function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`
}

export function DriveProvider({ book, onBook, onPulled, children }: Props) {
  const { importArchive } = useActivities()
  const profile = activeProfile(book)
  const linked = profile.drive ?? null
  const [status, setStatus] = useState<DriveStatus>('off')
  const [message, setMessage] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(() => hasSession())

  // Async work reads the latest book and callbacks through refs, never through the render it started from.
  const bookRef = useRef(book)
  bookRef.current = book
  const callbacks = useRef({ onBook, onPulled, importArchive })
  callbacks.current = { onBook, onPulled, importArchive }
  // Syncs run one after the other, so two of them never write the same file at once.
  const queue = useRef<Promise<void>>(Promise.resolve())
  // Local edits not yet confirmed by Drive. A failed push keeps this set, so the next sync sends them.
  const dirty = useRef(false)

  const commit = (next: ProfileBook, silent: boolean) => {
    bookRef.current = next
    callbacks.current.onBook(next, silent)
  }

  const fail = (cause: unknown) => {
    if (cause instanceof SignInError || (cause instanceof DriveError && cause.status === 401)) {
      clearSession()
      setSignedIn(false)
      setStatus('signin')
    } else {
      setStatus('error')
    }
    setMessage(cause instanceof Error ? cause.message : 'Google Drive could not be reached.')
  }

  /** Pulls the file of the active profile; pushes too when `force` or when the merge brings something the file lacks. */
  const runSync = (force: boolean, interactive: boolean): Promise<void> => {
    const task = async () => {
      const active = activeProfile(bookRef.current)
      const current = active.drive
      if (!current || !googleConfigured()) return
      setStatus('syncing')
      try {
        const token = await getAccessToken(interactive)
        setSignedIn(true)
        const result = await syncWithDrive(active.id, active, current, token, force || dirty.current)
        dirty.current = false
        // Settings of the file are applied only when the file is newer than what is on screen now.
        const now = activeProfile(bookRef.current)
        let next = { ...bookRef.current, profiles: bookRef.current.profiles.map((item) => (item.id === active.id ? { ...item, drive: result.link } : item)) }
        if (result.doc.settings.settingsAt > (now.settingsAt ?? '')) {
          next = applySettings(next, active.id, result.doc.settings, result.doc.settings.settingsAt)
        }
        commit(next, true)
        setStatus(result.link.canEdit ? 'saved' : 'readonly')
        setMessage(null)
        if (result.changed) callbacks.current.onPulled()
      } catch (cause) {
        fail(cause)
      }
    }
    queue.current = queue.current.then(task, task)
    return queue.current
  }

  // A local edit is sent after a short pause, so typing is not a request per keystroke.
  useEffect(() => {
    let timer: number | undefined
    const onChange = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const active = activeProfile(bookRef.current)
      if (id !== active.id || !active.drive || active.drive.canEdit === false) return
      dirty.current = true
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void runSync(true, false), PUSH_DELAY_MS)
    }
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.clearTimeout(timer)
    }
    // runSync reads only refs, so one subscription is enough.
  }, [])

  // Opening a linked profile, or switching to one, pulls its latest copy.
  useEffect(() => {
    if (!linked) {
      setStatus('off')
      setMessage(null)
      return
    }
    void runSync(false, false)
  }, [profile.id, linked?.fileId])

  // Coming back to the tab pulls changes made on another device.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !activeProfile(bookRef.current).drive || !hasSession()) return
      void runSync(false, false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const signIn = async () => {
    setMessage(null)
    try {
      await getAccessToken(true)
      setSignedIn(true)
      if (activeProfile(bookRef.current).drive) await runSync(false, false)
      else setStatus('off')
    } catch (cause) {
      fail(cause)
    }
  }

  const saveToDrive = async () => {
    const active = activeProfile(bookRef.current)
    if (active.drive) return
    setStatus('syncing')
    setMessage(null)
    try {
      const token = await getAccessToken(true)
      setSignedIn(true)
      const folder = await pickDrive(token, { mode: 'folder', title: 'Choose the folder for the profile' })
      if (!folder) {
        setStatus('off')
        return
      }
      const stamped = stampSettings(bookRef.current, active.id, new Date().toISOString())
      const link = await createProfileFile(active.id, activeProfile(stamped), token, folder.id)
      // Linking does not move the activities: a profile saved here keeps the bundle of this device.
      commit(setDriveLink(stamped, active.id, link), true)
      setStatus(link.canEdit ? 'saved' : 'readonly')
      setMessage('Saved to Google Drive.')
    } catch (cause) {
      fail(cause)
    }
  }

  const changeFolder = async () => {
    const link = activeProfile(bookRef.current).drive
    if (!link) return
    if (!link.canEdit) {
      setMessage('You have view access to this file, so it cannot be moved.')
      return
    }
    setStatus('syncing')
    setMessage(null)
    try {
      const token = await getAccessToken(true)
      setSignedIn(true)
      const folder = await pickDrive(token, { mode: 'folder', title: 'Choose the folder for the profile' })
      if (!folder) {
        setStatus('saved')
        return
      }
      await moveFile(link.fileId, folder.id, token)
      if (link.archiveId) await moveFile(link.archiveId, folder.id, token)
      setStatus('saved')
      setMessage(`Moved to ${folder.name}.`)
    } catch (cause) {
      fail(cause)
    }
  }

  const loadFromDrive = async () => {
    setStatus('syncing')
    setMessage(null)
    try {
      const token = await getAccessToken(true)
      setSignedIn(true)
      const picked = await pickDrive(token, { mode: 'file', mimeType: JSON_TYPE, title: 'Choose an AsphaltBurner profile' })
      if (!picked) {
        setStatus(activeProfile(bookRef.current).drive ? 'saved' : 'off')
        return
      }
      const current = bookRef.current
      const known = current.profiles.find((item) => item.drive?.fileId === picked.id)
      if (known) {
        commit(selectProfile(current, known.id), true)
        setStatus('saved')
        return
      }
      const remote = await readRemote(picked.id, token)
      const created = addProfile(current, remote.doc.settings.name)
      const drive: DriveLink = {
        fileId: picked.id,
        lastVersion: remote.file.version,
        lastSyncAt: new Date().toISOString(),
        canEdit: remote.file.canEdit,
        archiveId: null,
      }
      applyDoc(created.id, remote.doc)
      let next = setOwnBundle(setDriveLink(created.book, created.id, drive), created.id)
      next = applySettings(next, created.id, remote.doc.settings, remote.doc.settings.settingsAt)
      commit(next, true)
      callbacks.current.onPulled()
      setStatus(drive.canEdit ? 'saved' : 'readonly')
      setMessage(`Loaded ${remote.file.name}. Restore its archive to see the activities.`)
    } catch (cause) {
      fail(cause)
    }
  }

  const backupArchive = async () => {
    const active = activeProfile(bookRef.current)
    const link = active.drive
    if (!link) return
    setStatus('syncing')
    setMessage(null)
    try {
      const zip = await loadZip(bundleKeyOf(active))
      if (!zip) throw new Error('Import the Strava zip on this device first. A backup needs the original file.')
      const token = await getAccessToken(true)
      setSignedIn(true)
      const stripped = await withoutMedia(zip)
      // A new archive goes next to the profile file, so both stay in the same folder.
      const [folderId] = await parentsOf(link.fileId, token)
      const file = await uploadFile(token, stripped, {
        name: ARCHIVE_FILE,
        mimeType: 'application/zip',
        fileId: link.archiveId ?? undefined,
        parentId: folderId,
      })
      commit(setDriveLink(bookRef.current, active.id, { ...link, archiveId: file.id }), true)
      setStatus('saved')
      setMessage(`Archive saved without the media folder (${megabytes(stripped.size)}).`)
    } catch (cause) {
      fail(cause)
    }
  }

  const restoreArchive = async () => {
    const active = activeProfile(bookRef.current)
    const link = active.drive
    if (!link) return
    if (!active.ownBundle) {
      setMessage('This profile uses the activities of this device. Load it from Drive on a new device to restore its archive.')
      return
    }
    setStatus('syncing')
    setMessage(null)
    try {
      const token = await getAccessToken(true)
      setSignedIn(true)
      let archiveId = link.archiveId
      if (!archiveId) {
        const picked = await pickDrive(token, { mode: 'file', mimeType: 'application/zip', title: 'Choose the Strava archive (zip)' })
        if (!picked) {
          setStatus('saved')
          return
        }
        archiveId = picked.id
      }
      const blob = await downloadFile(archiveId, token)
      await callbacks.current.importArchive(blob)
      if (archiveId !== link.archiveId) commit(setDriveLink(bookRef.current, active.id, { ...link, archiveId }), true)
      callbacks.current.onPulled()
      setStatus('saved')
      setMessage('Archive restored.')
    } catch (cause) {
      fail(cause)
    }
  }

  /** Removes the link only. This device keeps its copy and Drive keeps its file. */
  const unlink = () => {
    const active = activeProfile(bookRef.current)
    commit(setDriveLink(bookRef.current, active.id, null), true)
    setStatus('off')
    setMessage('Unlinked. This device keeps its copy, Drive keeps the file.')
  }

  const value: DriveValue = {
    configured: googleConfigured(),
    status,
    message,
    linked,
    signedIn,
    signIn,
    saveToDrive,
    changeFolder,
    loadFromDrive,
    syncNow: () => runSync(true, true),
    backupArchive,
    restoreArchive,
    unlink,
  }

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>
}
