import { downloadFile, getFile, uploadFile, type DriveFile } from '../google/drive'
import type { DriveLink, Profile } from '../profiles'
import { applyDoc, buildDoc, mergeDocs, PROFILE_FILE, readDoc, sameDoc, type ProfileDoc } from './profileDoc'

/** What one sync did: the link to keep, the merged document, and whether the local data changed. */
export type SyncResult = { link: DriveLink; doc: ProfileDoc; changed: boolean }

const JSON_TYPE = 'application/json'

function docBlob(doc: ProfileDoc): Blob {
  return new Blob([JSON.stringify(doc)], { type: JSON_TYPE })
}

/** Reads the profile file and checks it is an AsphaltBurner profile. */
export async function readRemote(fileId: string, token: string): Promise<{ file: DriveFile; doc: ProfileDoc }> {
  const file = await getFile(fileId, token)
  const text = await (await downloadFile(fileId, token)).text()
  let doc: ProfileDoc | null = null
  try {
    doc = readDoc(JSON.parse(text))
  } catch {
    doc = null
  }
  if (!doc) throw new Error('This file is not an AsphaltBurner profile.')
  return { file, doc }
}

/**
 * Two-way sync of one linked profile.
 * - Remote changed since the last sync: its copy is merged into the local data and stored.
 * - Editor access and local changes (`force`, or the merge brought something the remote lacks): the merged copy is uploaded.
 * - Viewer access: only the pull happens; nothing is uploaded.
 */
export async function syncWithDrive(profileId: string, profile: Profile, link: DriveLink, token: string, force: boolean): Promise<SyncResult> {
  const file = await getFile(link.fileId, token)
  const now = new Date().toISOString()
  const before = buildDoc(profileId, profile, now)

  let remote: ProfileDoc | null = null
  if (file.version !== link.lastVersion) {
    const pulled = await downloadFile(link.fileId, token)
    remote = readDoc(JSON.parse(await pulled.text()))
    if (!remote) throw new Error('This file is no longer an AsphaltBurner profile.')
  }

  let doc = before
  if (remote) {
    doc = mergeDocs(before, remote, now)
    applyDoc(profileId, doc)
  }

  let version = file.version
  if (file.canEdit && (force || (remote !== null && !sameDoc(doc, remote)))) {
    const uploaded = await uploadFile(token, docBlob(doc), { name: PROFILE_FILE, mimeType: JSON_TYPE, fileId: link.fileId })
    version = uploaded.version
  }

  return {
    link: { ...link, canEdit: file.canEdit, lastVersion: version, lastSyncAt: now },
    doc,
    changed: !sameDoc(before, doc),
  }
}

/** Creates the profile file, in the given folder or at the top of the Drive. */
export async function createProfileFile(profileId: string, profile: Profile, token: string, parentId?: string): Promise<DriveLink> {
  const now = new Date().toISOString()
  const doc = buildDoc(profileId, profile, now)
  const file = await uploadFile(token, docBlob(doc), { name: PROFILE_FILE, mimeType: JSON_TYPE, parentId })
  return { fileId: file.id, lastVersion: file.version, lastSyncAt: now, canEdit: file.canEdit, archiveId: null }
}
