const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FIELDS = 'id,name,version,capabilities(canEdit)'

export type DriveFile = { id: string; name: string; version: string; canEdit: boolean }

/** A failed Drive call. `status` is the HTTP status, so the caller can tell sign-in problems apart. */
export class DriveError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function explain(status: number): string {
  if (status === 401) return 'Google sign-in expired. Sign in again.'
  if (status === 403) return 'Google Drive refused this. Check that the file is shared with your account.'
  if (status === 404) return 'This file is not available. It may have been removed or not shared with you.'
  return `Google Drive answered ${status}.`
}

async function call(url: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit }, token?: string): Promise<Response> {
  const headers = { ...(init.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }
  const response = await fetch(url, { method: init.method ?? 'GET', headers, body: init.body })
  if (!response.ok) throw new DriveError(explain(response.status), response.status)
  return response
}

function toFile(raw: unknown): DriveFile {
  const row = raw as { id?: unknown; name?: unknown; version?: unknown; capabilities?: { canEdit?: unknown } }
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    version: String(row.version ?? ''),
    canEdit: row.capabilities?.canEdit === true,
  }
}

export async function getFile(fileId: string, token: string): Promise<DriveFile> {
  const response = await call(`${FILES}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FIELDS)}`, {}, token)
  return toFile(await response.json())
}

export async function downloadFile(fileId: string, token: string): Promise<Blob> {
  const response = await call(`${FILES}/${encodeURIComponent(fileId)}?alt=media`, {}, token)
  return response.blob()
}

/** Folder ids a file is in. Usually one. */
export async function parentsOf(fileId: string, token: string): Promise<string[]> {
  const response = await call(`${FILES}/${encodeURIComponent(fileId)}?fields=parents`, {}, token)
  return ((await response.json()) as { parents?: string[] }).parents ?? []
}

/** Moves a file into `folderId`. The file keeps its id, so links to it stay valid. */
export async function moveFile(fileId: string, folderId: string, token: string): Promise<void> {
  const url = `${FILES}/${encodeURIComponent(fileId)}`
  const parents = await parentsOf(fileId, token)
  if (parents.includes(folderId)) return
  const remove = parents.length > 0 ? `&removeParents=${encodeURIComponent(parents.join(','))}` : ''
  await call(`${url}?addParents=${encodeURIComponent(folderId)}${remove}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }, token)
}

/**
 * Creates a file, or replaces the content of `fileId`. Uses a resumable session: one request opens it,
 * one sends the whole body. The same path serves the small profile JSON and the large archive.
 */
export async function uploadFile(
  token: string,
  body: Blob,
  options: { name: string; mimeType: string; fileId?: string; parentId?: string },
): Promise<DriveFile> {
  const base = options.fileId ? `${UPLOAD}/${encodeURIComponent(options.fileId)}` : UPLOAD
  const metadata: Record<string, unknown> = { name: options.name, mimeType: options.mimeType }
  if (options.parentId && !options.fileId) metadata.parents = [options.parentId]
  const session = await call(
    `${base}?uploadType=resumable`,
    {
      method: options.fileId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': options.mimeType,
        'x-upload-content-length': String(body.size),
      },
      body: JSON.stringify(metadata),
    },
    token,
  )
  const location = session.headers.get('location')
  if (!location) throw new DriveError('Google Drive did not open an upload.', 500)
  const sent = await call(location, { method: 'PUT', headers: { 'content-type': options.mimeType }, body })
  const created = toFile(await sent.json())
  // The version and the edit right come from a plain read, not from the upload response.
  return getFile(created.id, token)
}

