/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth web client id. Public. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** Browser API key for the Picker. Public, restricted to the app origins in Google Cloud. */
  readonly VITE_GOOGLE_API_KEY?: string
  /** Google Cloud project number, used as the Picker app id. */
  readonly VITE_GOOGLE_APP_ID?: string
}
