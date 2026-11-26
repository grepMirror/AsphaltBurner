import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useActivities } from '../activities'
import { CHANGE_EVENT, removePlannerData } from '../profileData'
import { activeProfile, applySettings, resetProfile, setDriveLink, stampSettings, type DriveLink, type Profile, type ProfileBook } from '../profiles'
import { clearSession, getAccessToken, hasSession, signInNote, SignInError } from '../google/auth'
import { googleConfigured } from '../google/config'
import { accountEmail, downloadFile, DriveError, findFiles, folderOf, moveFile, parentsOf, uploadFile, type DriveFile } from '../google/drive'
import { pickDrive } from '../google/picker'
import { bundleKeyOf, loadZip } from '../store'
import { emptyBlocks, loadBlocks } from '../blocks'
import { loadPlan } from '../plan'
import { loadBook } from '../plans'
import { stableJson } from '../stamp'
import { withoutMedia } from './archive'
import { applyDoc, ARCHIVE_FILE, PROFILE_FILE, type ProfileDoc } from './profileDoc'
import { createProfileFile, readRemote, syncWithDrive } from './driveSync'

type Counts = { sessions: number; plans: number }

/** A question for the athlete, asked in a window. The profile one comes first, when the folder already holds this profile and this device has data. */
type Pending =
  | { kind: 'profile'; profileId: string; file: DriveFile; doc: ProfileDoc; folder: { id: string; name: string }; archiveId: string | null; local: Counts; remote: Counts }
  | { kind: 'other'; profileId: string; file: DriveFile; doc: ProfileDoc; folder: { id: string; name: string }; archiveId: string | null; localName: string }
  | { kind: 'missing'; profileId: string; folder: { id: string; name: string }; archiveId: string | null; localName: string }
  | { kind: 'archive'; archiveId: string; folderName: string }
  | { kind: 'loaded'; profileName: string; folderName: string | null; archive: boolean }

/** `sync` saves the local profile to the folder and `new` erases this device and saves an empty profile there. Both answer the question of a folder without this profile. */
export type PromptChoice = 'merge' | 'replace' | 'cancel' | 'sync' | 'new'
/** What the window needs to explain the choice. `loaded` only informs: it has no choice to make. */
export type PromptView =
  | { kind: 'profile'; folderName: string; local: Counts; remote: Counts }
  | { kind: 'other'; folderName: string; localName: string; remoteName: string; archive: boolean }
  | { kind: 'missing'; folderName: string; localName: string }
  | { kind: 'archive'; folderName: string }
  | { kind: 'loaded'; profileName: string; folderName: string | null; archive: boolean }

function viewOf(pending: Pending): PromptView {
  if (pending.kind === 'other') return { kind: 'other', folderName: pending.folder.name, localName: pending.localName, remoteName: pending.doc.settings.name, archive: Boolean(pending.archiveId) }
  if (pending.kind === 'profile') return { kind: 'profile', folderName: pending.folder.name, local: pending.local, remote: pending.remote }
  if (pending.kind === 'missing') return { kind: 'missing', folderName: pending.folder.name, localName: pending.localName }
  if (pending.kind === 'archive') return { kind: 'archive', folderName: pending.folderName }
  return { kind: 'loaded', profileName: pending.profileName, folderName: pending.folderName, archive: pending.archive }
}

/** Shown when a profile has no archive in Drive and this device has no zip to save. */
const NO_ARCHIVE = 'The archive is not in Drive, and this device has no Strava zip. Import your zip again (Profile, Activities, Import zip), come back here and click Back up archive.'
/** Shown when a profile has no archive in Drive but this device has the zip. */
const ARCHIVE_TODO = 'The archive is not in Drive yet. Click Back up archive to save it.'

/** True when this device already has planner data for the profile: sessions, a second plan, or its own block kinds or tags. */
function hasLocalPlanner(profileId: string): boolean {
  return loadPlan(profileId).length > 0 || loadBook(profileId).plans.length > 1 || stableJson(loadBlocks(profileId)) !== stableJson(emptyBlocks())
}

function driveLinkOf(file: DriveFile, folder: { name: string }, archiveId: string | null, lastVersion: string | null): DriveLink {
  return { fileId: file.id, lastVersion, lastSyncAt: new Date().toISOString(), canEdit: file.canEdit, archiveId, folderName: folder.name }
}

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
  /** Google account that signed in. */
  email: string | null
  signIn: () => Promise<void>
  /** Picks a folder. Links to the profile file already there, or asks whether to save this profile to a folder without one. */
  saveToDrive: () => Promise<void>
  /** Set while the athlete has to choose between merge, replace and cancel. */
  prompt: PromptView | null
  answer: (choice: PromptChoice) => Promise<void>
  /** Shown on the card while the profile has no archive in Drive. Null when there is nothing to do. */
  archiveHint: string | null
  /** Moves the linked file, and its archive, into another folder the user picks. */
  changeFolder: () => Promise<void>
  syncNow: () => Promise<void>
  backupArchive: () => Promise<void>
  restoreArchive: () => Promise<void>
  unlink: () => void
}

const DriveContext = createContext<DriveValue | null>(null)
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
  const { importArchive, clear, disconnectGarmin, activities, ready } = useActivities()
  const profile = activeProfile(book)
  const linked = profile.drive ?? null
  const [status, setStatus] = useState<DriveStatus>('off')
  const [message, setMessage] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(() => hasSession())
  const [email, setEmail] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  // Whether this device keeps the Strava zip of the active profile. Null while it is being read.
  const [hasZip, setHasZip] = useState<boolean | null>(null)

  // Async work reads the latest book and callbacks through refs, never through the render it started from.
  const bookRef = useRef(book)
  bookRef.current = book
  const callbacks = useRef({ onBook, onPulled, importArchive, clear, disconnectGarmin })
  callbacks.current = { onBook, onPulled, importArchive, clear, disconnectGarmin }
  // -1 while the saved activities are still loading, so a profile is never taken for empty before they are read.
  const activityCount = useRef(0)
  activityCount.current = ready ? activities.length : -1
  // Syncs run one after the other, so two of them never write the same file at once.
  const queue = useRef<Promise<void>>(Promise.resolve())
  // Local edits not yet confirmed by Drive. A failed push keeps this set, so the next sync sends them.
  const dirty = useRef(false)
  // Whether the last sync worked, for the actions that run one and then go on.
  const syncOk = useRef(true)

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
        // Links saved before the folder name was stored get it on their first sync.
        const folderName = result.link.folderName ?? (await folderOf(result.link.fileId, token).catch(() => null))?.name ?? null
        const link = { ...result.link, folderName }
        // Settings of the file are applied only when the file is newer than what is on screen now.
        const now = activeProfile(bookRef.current)
        let next = { ...bookRef.current, profiles: bookRef.current.profiles.map((item) => (item.id === active.id ? { ...item, drive: link } : item)) }
        if (result.doc.settings.settingsAt > (now.settingsAt ?? '')) {
          next = applySettings(next, active.id, result.doc.settings, result.doc.settings.settingsAt)
        }
        commit(next, true)
        setStatus(result.link.canEdit ? 'saved' : 'readonly')
        setMessage(null)
        syncOk.current = true
        if (result.changed) callbacks.current.onPulled()
      } catch (cause) {
        syncOk.current = false
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

  // Opening a linked profile pulls its latest copy.
  useEffect(() => {
    if (!linked) {
      setStatus('off')
      setMessage(null)
      setPending(null)
      return
    }
    void runSync(false, false)
  }, [profile.id, linked?.fileId])

  // Sign-in leaves the page and comes back. When Google refused, the card says why. A linked profile gets it from its own sync.
  useEffect(() => {
    const note = signInNote()
    if (!note) return
    setStatus('error')
    setMessage(note)
  }, [])

  // Coming back to the tab pulls changes made on another device.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !activeProfile(bookRef.current).drive || !hasSession()) return
      void runSync(false, false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // The zip is read again when the profile or its activities change, so the card hint stays right after an import.
  useEffect(() => {
    let cancelled = false
    void loadZip(bundleKeyOf(profile)).then((zip) => {
      if (!cancelled) setHasZip(zip !== null)
    })
    return () => {
      cancelled = true
    }
  }, [profile.id, profile.ownBundle, activities.length, ready])

  // The account shown on the card follows the sign-in.
  useEffect(() => {
    if (!signedIn) {
      setEmail(null)
      return
    }
    let cancelled = false
    void getAccessToken(false)
      .then(accountEmail)
      .then((value) => {
        if (!cancelled) setEmail(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [signedIn])

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

  /** Loads an archive from Drive into this device. `merge` adds the activities missing here; `replace` reloads them all. */
  const restoreFrom = async (archiveId: string, mode: 'merge' | 'replace', token: string) => {
    const blob = await downloadFile(archiveId, token)
    await callbacks.current.importArchive(blob, mode)
  }

  /** Uploads the zip of this device, without media, next to the profile file. Null when this device has no zip. */
  const uploadArchive = async (active: Profile, link: DriveLink, token: string): Promise<string | null> => {
    const zip = await loadZip(bundleKeyOf(active))
    if (!zip) return null
    const stripped = await withoutMedia(zip)
    // A new archive goes next to the profile file, so both stay in the same folder.
    const [folderId] = await parentsOf(link.fileId, token)
    const file = await uploadFile(token, stripped, {
      name: ARCHIVE_FILE,
      mimeType: 'application/zip',
      fileId: link.archiveId ?? undefined,
      parentId: folderId,
    })
    const latest = activeProfile(bookRef.current).drive ?? link
    commit(setDriveLink(bookRef.current, active.id, { ...latest, archiveId: file.id }), true)
    return `Archive saved without the media folder (${megabytes(stripped.size)}).`
  }

  /** Right after linking: load the folder's archive when this device has no activities, or save this device's archive when the folder has none. */
  const settleArchive = async (token: string): Promise<string | null> => {
    const active = activeProfile(bookRef.current)
    const link = active.drive
    if (!link) return null
    if (link.archiveId) {
      if (activityCount.current !== 0) return null
      await restoreFrom(link.archiveId, 'replace', token)
      return 'Archive loaded from Drive.'
    }
    if (!link.canEdit) return null
    return (await uploadArchive(active, link, token)) ?? NO_ARCHIVE
  }

  /** Empties this device: planner data, name and heart rate, activities, the stored zip and the Garmin login. The profile keeps its id. */
  const eraseDevice = async (profileId: string) => {
    removePlannerData(profileId)
    await callbacks.current.disconnectGarmin()
    await callbacks.current.clear()
    commit(resetProfile(bookRef.current, profileId), true)
    setHasZip(false)
    callbacks.current.onPulled()
  }

  /** Saves the profile as a new file in the folder, with the archive of this device when there is one. */
  const saveNew = async (profileId: string, folder: { id: string; name: string }, archiveId: string | null, token: string) => {
    const stamped = stampSettings(bookRef.current, profileId, new Date().toISOString())
    const link = await createProfileFile(profileId, activeProfile(stamped), token, folder)
    // Linking does not move the activities: a profile saved here keeps the bundle of this device.
    commit(setDriveLink(stamped, profileId, { ...link, archiveId }), true)
    const note = await settleArchive(token)
    setStatus(link.canEdit ? 'saved' : 'readonly')
    setMessage(`Saved to the folder "${folder.name}".${note ? ` ${note}` : ''}`)
  }

  const saveToDrive = async () => {
    const active = activeProfile(bookRef.current)
    if (active.drive) return
    setStatus('syncing')
    setMessage(null)
    setPending(null)
    try {
      const token = await getAccessToken(true)
      setSignedIn(true)
      const folder = await pickDrive(token, { mode: 'folder', title: 'Choose the folder for the profile' })
      if (!folder) {
        setStatus('off')
        return
      }
      // The folder may already hold this profile, saved from another device or an earlier try. Link to it instead of adding a copy.
      const [existing] = await findFiles(token, folder.id, PROFILE_FILE)
      const [archive] = await findFiles(token, folder.id, ARCHIVE_FILE)
      const archiveId = archive?.id ?? null
      if (!existing) {
        // This profile is not in the folder yet. The window asks whether to save it there or to start a new profile.
        setPending({ kind: 'missing', profileId: active.id, folder, archiveId, localName: active.name })
        setStatus('off')
        return
      }
      const remote = await readRemote(existing.id, token)
      // One folder, one profile: a profile with another name is never linked or merged without being asked.
      if (remote.doc.settings.name.trim().toLowerCase() !== active.name.trim().toLowerCase()) {
        setPending({ kind: 'other', profileId: active.id, file: remote.file, doc: remote.doc, folder, archiveId, localName: active.name })
        setStatus('off')
        return
      }
      if (!hasLocalPlanner(active.id)) {
        // Nothing to lose here: link and merge, which loads the file's data into this profile.
        commit(setDriveLink(bookRef.current, active.id, driveLinkOf(remote.file, folder, archiveId, null)), true)
        await runSync(true, true)
        if (!syncOk.current) return
        await settleArchive(token)
        // The profile came from the folder. The window says whether its archive came with it, since without one it has no activities.
        setMessage(null)
        setPending({ kind: 'loaded', profileName: remote.doc.settings.name, folderName: folder.name, archive: Boolean(activeProfile(bookRef.current).drive?.archiveId) })
        return
      }
      setPending({
        kind: 'profile',
        profileId: active.id,
        file: remote.file,
        doc: remote.doc,
        folder,
        archiveId,
        local: { sessions: loadPlan(active.id).length, plans: loadBook(active.id).plans.length },
        remote: { sessions: remote.doc.sessions.length, plans: remote.doc.plans.length },
      })
      setStatus('off')
    } catch (cause) {
      fail(cause)
    }
  }

  const answer = async (choice: PromptChoice) => {
    const current = pending
    setPending(null)
    if (!current || current.kind === 'loaded') return
    if (choice === 'cancel') {
      setStatus(activeProfile(bookRef.current).drive ? 'saved' : 'off')
      setMessage(current.kind === 'archive' ? 'The archive was left as it is.' : 'Nothing was linked. This device keeps its data.')
      return
    }
    setStatus('syncing')
    try {
      const token = await getAccessToken(true)
      setSignedIn(true)
      if (current.kind === 'missing') {
        if (choice === 'new') await eraseDevice(current.profileId)
        await saveNew(current.profileId, current.folder, current.archiveId, token)
        return
      }
      if (current.kind === 'archive') {
        await restoreFrom(current.archiveId, choice === 'merge' ? 'merge' : 'replace', token)
        setStatus('saved')
        setMessage(choice === 'merge' ? 'Archive merged: only the activities missing here were added.' : 'Archive replaced: all activities were reloaded from Drive.')
        return
      }
      if (choice === 'replace') {
        // The file wins: this device's planner data is replaced by the file's.
        applyDoc(current.profileId, current.doc)
        const linkedBook = setDriveLink(bookRef.current, current.profileId, driveLinkOf(current.file, current.folder, current.archiveId, current.file.version))
        commit(applySettings(linkedBook, current.profileId, current.doc.settings, current.doc.settings.settingsAt), true)
        callbacks.current.onPulled()
      } else {
        // Merge: link without a known version, so the sync pulls the file, merges by item, and pushes the result.
        commit(setDriveLink(bookRef.current, current.profileId, driveLinkOf(current.file, current.folder, current.archiveId, null)), true)
        await runSync(true, true)
        if (!syncOk.current) return
      }
      if (current.kind === 'other') {
        // Load means all of it: the planner data above, and the archive, which replaces the activities on this device.
        if (current.archiveId) await restoreFrom(current.archiveId, 'replace', token)
        setStatus(current.file.canEdit ? 'saved' : 'readonly')
        setMessage(null)
        setPending({ kind: 'loaded', profileName: current.doc.settings.name, folderName: current.folder.name, archive: Boolean(current.archiveId) })
        return
      }
      const note = await settleArchive(token)
      setStatus(current.file.canEdit ? 'saved' : 'readonly')
      const done = choice === 'merge' ? 'Merged with' : "Replaced this device's data with"
      setMessage(`${done} the profile in "${current.folder.name}".${note ? ` ${note}` : ''}`)
    } catch (cause) {
      fail(cause)
    }
  }

  const changeFolder = async () => {
    const active = activeProfile(bookRef.current)
    const link = active.drive
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
      commit(setDriveLink(bookRef.current, active.id, { ...link, folderName: folder.name }), true)
      setStatus('saved')
      setMessage(`Moved to the folder "${folder.name}".`)
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
      const token = await getAccessToken(true)
      setSignedIn(true)
      const note = await uploadArchive(active, link, token)
      if (!note) throw new Error('Import the Strava zip on this device first. A backup needs the original file.')
      setStatus('saved')
      setMessage(note)
    } catch (cause) {
      fail(cause)
    }
  }

  const restoreArchive = async () => {
    const active = activeProfile(bookRef.current)
    const link = active.drive
    if (!link) return
    setStatus('syncing')
    setMessage(null)
    try {
      const token = await getAccessToken(true)
      setSignedIn(true)
      const restored = link.canEdit ? 'saved' : 'readonly'
      let archiveId = link.archiveId
      if (!archiveId) {
        const picked = await pickDrive(token, { mode: 'file', mimeType: 'application/zip', title: 'Choose the Strava archive (zip)' })
        if (!picked) {
          setStatus(restored)
          return
        }
        archiveId = picked.id
        commit(setDriveLink(bookRef.current, active.id, { ...link, archiveId }), true)
      }
      if (activityCount.current === 0) {
        // Nothing here to keep or merge: load it.
        await restoreFrom(archiveId, 'replace', token)
        setStatus(restored)
        setMessage('Archive restored.')
        return
      }
      setPending({ kind: 'archive', archiveId, folderName: link.folderName ?? 'Drive' })
      setStatus(restored)
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
    email,
    signIn,
    saveToDrive,
    changeFolder,
    prompt: pending ? viewOf(pending) : null,
    answer,
    archiveHint: linked && linked.canEdit && !linked.archiveId && hasZip !== null ? (hasZip ? ARCHIVE_TODO : NO_ARCHIVE) : null,
    syncNow: () => runSync(true, true),
    backupArchive,
    restoreArchive,
    unlink,
  }

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>
}
