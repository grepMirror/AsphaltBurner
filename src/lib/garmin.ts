import JSZip from 'jszip'
import type { Activity, GarminState } from '../types'
import { parseFit, sportFromType } from './strava'

// The page talks to the backend container, which calls Garmin. The browser cannot (CORS).
const BACKEND = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3011').replace(/\/$/, '')
const API = `${BACKEND}/connectors/garmin`

export async function backendOnline(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND}/health`)
    return response.ok
  } catch {
    return false
  }
}
const PAGE = 20
const PAUSE_MS = 500
const TOKEN_MS = 23 * 60 * 60 * 1000

/** Stops a sync cleanly. What was already saved is kept. */
export class GarminStop extends Error {
  resetToken: boolean

  constructor(message: string, resetToken = false) {
    super(message)
    this.name = 'GarminStop'
    this.resetToken = resetToken
  }
}

export type SyncHooks = {
  /** Local days that already have a zip session. Garmin skips them. */
  zipDays: Set<string>
  /** Garmin ids already saved. Updated as activities are added. */
  known: Set<string>
  add: (activities: Activity[]) => Promise<void>
  saveState: (state: GarminState) => Promise<void>
}

type Summary = {
  activityId: number
  activityName?: string
  startTimeLocal?: string
  activityType?: { typeKey?: string }
  distance?: number
  duration?: number
  movingDuration?: number
  elapsedDuration?: number
  averageHR?: number
  elevationGain?: number
}

const GARMIN_TYPE: Record<string, string> = {
  running: 'Run',
  trail_running: 'TrailRun',
  treadmill_running: 'Run',
  track_running: 'Run',
  cycling: 'Ride',
  road_biking: 'Ride',
  gravel_cycling: 'GravelRide',
  mountain_biking: 'MountainBikeRide',
  indoor_cycling: 'VirtualRide',
  lap_swimming: 'Swim',
  open_water_swimming: 'Swim',
  hiking: 'Hike',
  walking: 'Walk',
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const maxDay = (current: string | null, day: string) => (current === null || day > current ? day : current)
const minDay = (current: string | null, day: string) => (current === null || day < current ? day : current)

async function fetchGarmin(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new GarminStop('Connector backend is not running. Start it with docker compose up backend. Zip import still works.')
  }
}

/** Exchanges a Personal API key for a 24-hour bearer token. Garmin has no refresh token. */
export async function issueToken(apiKey: string): Promise<{ token: string; expiresAt: number }> {
  const response = await fetchGarmin(`${API}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${apiKey}` },
  })
  if (response.status === 401 || response.status === 403) {
    throw new GarminStop('Garmin rejected this key. Create a new one on Garmin Connect.')
  }
  if (!response.ok) throw new GarminStop(`Garmin answered ${response.status} to the token request.`)
  const text = (await response.text()).trim()
  // Garmin returns the JWT itself. A JSON wrapper is accepted if they change that.
  let token = text
  if (text.startsWith('{') || text.startsWith('"')) {
    const body = JSON.parse(text) as { access_token?: string } | string
    token = typeof body === 'string' ? body : body.access_token ?? ''
  }
  if (!token.startsWith('eyJ')) throw new GarminStop('Garmin sent no access token.')
  return { token, expiresAt: Date.now() + TOKEN_MS }
}

/** First-time setup: proves the key works and returns the state to save. */
export async function connectGarmin(apiKey: string): Promise<GarminState> {
  const issued = await issueToken(apiKey)
  return {
    apiKey,
    token: issued.token,
    tokenExpiresAt: issued.expiresAt,
    lastSync: null,
    newestDay: null,
    oldestDay: null,
    historyComplete: false,
  }
}

async function garminGet(path: string, token: string): Promise<Response> {
  const response = await fetchGarmin(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new GarminStop('Garmin session expired. Sync again to refresh it.', true)
  if (response.status === 429) throw new GarminStop('Garmin rate limit reached. What was saved is kept; sync again later.')
  if (!response.ok) throw new GarminStop(`Garmin answered ${response.status}. Sync stopped; what was saved is kept.`)
  return response
}

/** Garmin gives startTimeLocal as "YYYY-MM-DD HH:MM:SS" in the athlete's local time. */
function startOf(summary: Summary): { day: string; iso: string } | null {
  const local = summary.startTimeLocal ?? ''
  const ms = Date.parse(local.replace(' ', 'T'))
  if (!/^\d{4}-\d{2}-\d{2}/.test(local) || Number.isNaN(ms)) return null
  return { day: local.slice(0, 10), iso: new Date(ms).toISOString() }
}

function summaryActivity(summary: Summary, iso: string): Activity {
  const key = summary.activityType?.typeKey ?? 'other'
  const type = GARMIN_TYPE[key] ?? key
  const moving = summary.movingDuration ?? summary.duration ?? 0
  return {
    id: `garmin:${summary.activityId}`,
    name: summary.activityName || 'Session',
    type,
    sport: sportFromType(type),
    date: iso,
    movingSec: moving,
    elapsedSec: summary.elapsedDuration ?? summary.duration ?? moving,
    distanceM: summary.distance ?? 0,
    elevationM: summary.elevationGain ?? 0,
    avgHr: summary.averageHR ?? null,
    track: [],
    stream: [],
    source: 'garmin',
  }
}

/** Summary first; the FIT adds the map, pace and heart-rate stream when it can be read. */
async function toActivity(token: string, summary: Summary, iso: string): Promise<Activity> {
  const base = summaryActivity(summary, iso)
  const response = await garminGet(`/download-service/files/activity/${summary.activityId}`, token)
  try {
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const entry = Object.values(zip.files).find((file) => !file.dir && file.name.toLowerCase().endsWith('.fit'))
    if (!entry) return base
    const parsed = await parseFit(await entry.async('arraybuffer'))
    return { ...base, track: parsed.track, stream: parsed.stream }
  } catch {
    // Unreadable FIT: keep the summary so this activity is not fetched again.
    return base
  }
}

async function listPage(token: string, start: number, range: { startDate?: string; endDate?: string }): Promise<Summary[]> {
  const query = new URLSearchParams({ start: String(start), limit: String(PAGE) })
  if (range.startDate) query.set('startDate', range.startDate)
  if (range.endDate) query.set('endDate', range.endDate)
  const response = await garminGet(`/activitylist-service/activities/search/activities?${query}`, token)
  const body = (await response.json()) as Summary[] | { activities?: Summary[] } | null
  const list = Array.isArray(body) ? body : body?.activities
  return Array.isArray(list) ? list : []
}

/** Walks newest first until Garmin returns an empty page. */
async function walk(token: string, range: { startDate?: string; endDate?: string }, visit: (summary: Summary) => Promise<void>) {
  for (let start = 0; ; ) {
    const page = await listPage(token, start, range)
    if (page.length === 0) return
    for (const summary of page) await visit(summary)
    start += page.length
    await pause(PAUSE_MS)
  }
}

/**
 * Keeps one processed region [oldestDay, newestDay]. Each pass only extends it, so a stop never leaves a gap.
 * The first pass (no region yet) walks from the top; a completed walk reached the bottom.
 */
export async function syncGarmin(start: GarminState, hooks: SyncHooks): Promise<void> {
  const state: GarminState = { ...start }
  let pending: Activity[] = []
  const flush = async () => {
    if (pending.length === 0) return
    const batch = pending
    pending = []
    await hooks.add(batch)
  }

  try {
    let token = state.token
    if (!token || Date.now() >= state.tokenExpiresAt) {
      const issued = await issueToken(state.apiKey)
      token = issued.token
      state.token = token
      state.tokenExpiresAt = issued.expiresAt
    }
    const bearer = token

    const visit = async (summary: Summary) => {
      const at = startOf(summary)
      if (!at) return
      state.newestDay = maxDay(state.newestDay, at.day)
      state.oldestDay = minDay(state.oldestDay, at.day)
      const id = `garmin:${summary.activityId}`
      if (hooks.zipDays.has(at.day) || hooks.known.has(id)) return
      pending.push(await toActivity(bearer, summary, at.iso))
      hooks.known.add(id)
      if (pending.length >= PAGE) await flush()
      await pause(PAUSE_MS)
    }

    // Front: activities newer than the processed region (or everything, on the first sync).
    const firstSync = state.newestDay === null
    await walk(bearer, { startDate: state.newestDay ?? undefined }, visit)
    if (firstSync) state.historyComplete = true

    // Back: continue older than the region, until Garmin runs out.
    if (!state.historyComplete && state.oldestDay) {
      await walk(bearer, { endDate: state.oldestDay }, visit)
      state.historyComplete = true
    }

    state.lastSync = new Date().toISOString()
  } catch (cause) {
    if (cause instanceof GarminStop && cause.resetToken) state.token = null
    throw cause
  } finally {
    await flush()
    await hooks.saveState(state)
  }
}
