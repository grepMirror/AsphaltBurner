import { DRIVE_SCOPE, GOOGLE, googleConfigured } from './config'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SESSION_KEY = 'asphaltburner.google.session'
const PENDING_KEY = 'asphaltburner.google.pending'

/** The user has to sign in again, or allow the app, before Drive can be used. */
export class SignInError extends Error {
  readonly needsUser = true
}

type Session = { value: string; expiresAt: number }
type Pending = { state: string; path: string }

const scripts = new Map<string, Promise<void>>()
/** Why the last sign-in did not work, as Google reported it on the way back. Kept until the next attempt. */
let redirectNote: string | null = null

/** Loads a script once. Used by the Picker. */
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

/** What Google put in the address on the way back: a token, an error, or null when it is not an answer to our request. */
export function readRedirect(hash: string, expectedState: string | null): { token: string; expiresIn: number } | { error: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.has('access_token') && !params.has('error')) return null
  // The state proves this answer belongs to a sign-in this tab started.
  if (!expectedState || params.get('state') !== expectedState) return null
  const error = params.get('error')
  if (error) {
    return { error: error === 'access_denied' ? 'Google refused the sign-in. While the app is in testing, the account must be listed as a test user.' : `Google sign-in failed (${error}).` }
  }
  const token = params.get('access_token')
  return token ? { token, expiresIn: Number(params.get('expires_in')) || 3600 } : null
}

function readStored<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function valid(session: Session | null): session is Session {
  return session !== null && typeof session.value === 'string' && session.expiresAt - 60_000 > Date.now()
}

// The token lives in this tab only: it survives the page reload that sign-in needs, and goes with the tab.
let session: Session | null = typeof window === 'undefined' ? null : readStored<Session>(SESSION_KEY)

/** Takes the answer of a sign-in redirect out of the address, then restores the page the user was on. */
function consumeRedirect(): void {
  const hash = window.location.hash
  if (!hash.includes('access_token=') && !hash.includes('error=')) return
  const pending = readStored<Pending>(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  const result = readRedirect(hash, pending?.state ?? null)
  window.history.replaceState(null, '', result && pending ? pending.path : window.location.pathname + window.location.search)
  if (!result) return
  if ('error' in result) {
    redirectNote = result.error
    return
  }
  session = { value: result.token, expiresAt: Date.now() + result.expiresIn * 1000 }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

if (typeof window !== 'undefined') consumeRedirect()

export function hasSession(): boolean {
  return valid(session)
}

/** Why the last sign-in failed, or null. */
export function signInNote(): string | null {
  return redirectNote
}

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * An access token for Drive. Without one, `interactive` sends the browser to Google, which sends it back to this
 * page with a token: that call never resolves, because the page leaves. Silent calls fail instead, so nothing moves on its own.
 */
export async function getAccessToken(interactive: boolean): Promise<string> {
  if (valid(session)) return session.value
  if (!googleConfigured()) throw new Error('Google Drive is not set up on this build.')
  if (!interactive) throw new SignInError(redirectNote ?? 'Sign in to Google again.')
  redirectNote = null
  const state = randomState()
  const pending: Pending = { state, path: window.location.pathname + window.location.search }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: GOOGLE.clientId,
    // Must match an authorized redirect URI of the OAuth client: the origin plus the base path of the app.
    redirect_uri: `${window.location.origin}${import.meta.env.BASE_URL}`,
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state,
  }).toString()
  window.location.assign(url.toString())
  return new Promise<string>(() => undefined)
}

/** Forgets the token on this device. The local profile data stays. */
export function clearSession(): void {
  const token = session?.value
  session = null
  sessionStorage.removeItem(SESSION_KEY)
  // No-cors: the answer is not needed, and the token stops working either way.
  if (token) void fetch(REVOKE_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(token)}` }).catch(() => undefined)
}

const entry = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1]
if (entry?.endsWith('auth.ts')) {
  const ok = readRedirect('#access_token=abc&expires_in=3599&state=s1&token_type=Bearer', 's1')
  if (!ok || !('token' in ok) || ok.token !== 'abc' || ok.expiresIn !== 3599) throw new Error('token')
  if (readRedirect('#access_token=abc&state=other', 's1') !== null) throw new Error('wrong state is ignored')
  if (readRedirect('#access_token=abc&state=s1', null) !== null) throw new Error('no pending request is ignored')
  if (readRedirect('#other=1', 's1') !== null) throw new Error('not an answer')
  const refused = readRedirect('#error=access_denied&state=s1', 's1')
  if (!refused || !('error' in refused) || !refused.error.includes('test user')) throw new Error('denied')
  const other = readRedirect('#error=invalid_request&state=s1', 's1')
  if (!other || !('error' in other) || !other.error.includes('invalid_request')) throw new Error('other error')
  const slow = readRedirect('#access_token=abc&state=s1', 's1')
  if (!slow || !('token' in slow) || slow.expiresIn !== 3600) throw new Error('default expiry')
  console.log('SELFTEST auth OK')
}
