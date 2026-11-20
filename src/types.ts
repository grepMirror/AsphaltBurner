export type Sport = 'run' | 'swim' | 'ride' | 'other'

export type StreamPoint = {
  t: number
  d: number
  alt: number | null
  hr: number | null
  cad: number | null
  speed: number | null
}

export type Activity = {
  id: string
  name: string
  type: string
  sport: Sport
  date: string
  movingSec: number
  elapsedSec: number
  distanceM: number
  elevationM: number
  avgHr: number | null
  track: [number, number][]
  stream: StreamPoint[]
  /** Missing on rows saved before connectors existed; those count as zip. */
  source?: 'zip' | 'garmin'
}

export type GarminState = {
  apiKey: string
  token: string | null
  tokenExpiresAt: number
  lastSync: string | null
  /** Top of the processed region (local YYYY-MM-DD). */
  newestDay: string | null
  /** Bottom of the processed region (local YYYY-MM-DD). */
  oldestDay: string | null
  historyComplete: boolean
}

export type ImportReport = {
  sessions: number
  tracks: number
  skipped: number
  unreadable: number
  source: 'zip' | 'sample'
}

export type RangeId = '4w' | '12w' | '12m' | 'all' | 'custom'
export type MetricId = 'km' | 'h' | 'sessions' | 'elev'

export type DateWindow = {
  start: string
  end: string
}
