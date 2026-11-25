import { DRIVE_SCOPE, GOOGLE, googleConfigured } from './config'

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client'

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string }
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void }
type GoogleAccounts = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type?: string }) => void
      }) => TokenClient
      revoke: (token: string, done?: () => void) => void
    }
  }
}

/** The user has to sign in again, or allow the app, before Drive can be used. */
export class SignInError extends Error {
  readonly needsUser = true
}

let session: { value: string; expiresAt: number } | null = null
const scripts = new Map<string, Promise<void>>()

/** Loads a script once. Shared by the sign-in and the Picker. */
export function loadScript(src: string): Promise<void> {
  let loading = scripts.get(src)
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scripts.delete(src)
        reject(new Error('A Google script could not be loaded. Check your connection.'))
      }
      document.head.appendChild(script)
    })
    scripts.set(src, loading)
  }
  return loading
}

export function hasSession(): boolean {
  return session !== null && session.expiresAt - 60_000 > Date.now()
}

/**
 * An access token for Drive, kept in memory only. `interactive` may open Google's window,
 * which the browser only allows right after a click. Without it, the request is silent.
 */
export async function getAccessToken(interactive: boolean): Promise<string> {
  if (session && session.expiresAt - 60_000 > Date.now()) return session.value
  if (!googleConfigured()) throw new Error('Google Drive is not set up on this build.')
  await loadScript(GIS_SCRIPT)
  const google = (window as unknown as { google?: GoogleAccounts }).google
  if (!google) throw new Error('Google sign-in did not load.')
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE.clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new SignInError(response.error === 'interaction_required' ? 'Sign in to Google again.' : 'Google sign-in was not completed.'))
          return
        }
        session = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000 }
        resolve(response.access_token)
      },
      error_callback: (error) => {
        reject(new SignInError(error.type === 'popup_closed' ? 'The Google window was closed.' : 'Google sign-in failed.'))
      },
    })
    client.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

/** Forgets the token on this device. The local profile data stays. */
export function clearSession(): void {
  const token = session?.value
  session = null
  const google = (window as unknown as { google?: GoogleAccounts }).google
  if (token && google) google.accounts.oauth2.revoke(token)
}
