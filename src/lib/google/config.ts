/**
 * Public identifiers of the Google Cloud project, read at build time. Nothing secret ships with the app.
 * Without them, every Drive action is shown as unavailable.
 * Trimmed: a line break pasted into the build settings would make Google reject the client ID.
 */
export const GOOGLE = {
  clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim(),
  apiKey: (import.meta.env.VITE_GOOGLE_API_KEY ?? '').trim(),
  /** Project number. The Picker needs it to grant access to the files the user picks. */
  appId: (import.meta.env.VITE_GOOGLE_APP_ID ?? '').trim(),
}

/** Only the files the app creates or the user picks. No access to the rest of the Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function googleConfigured(): boolean {
  return GOOGLE.clientId !== '' && GOOGLE.apiKey !== '' && GOOGLE.appId !== ''
}
