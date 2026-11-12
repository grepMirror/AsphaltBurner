import FitParser from 'fit-file-parser'
import JSZip from 'jszip'
import type { Activity, ImportReport, Sport, StreamPoint } from '../types'

const RUN = new Set(['run', 'virtualrun', 'trailrun', 'hike', 'snowshoe', 'trail'])
const SWIM = new Set(['swim', 'swimming', 'openwaterswim', 'poolswim'])
const RIDE = new Set(['ride', 'virtualride', 'mountainbikeride', 'gravelride', 'ebikeride', 'emountainbikeride', 'velomobile', 'handcycle'])

const TRACK_EXTENSIONS = ['.gpx', '.gpx.gz', '.fit', '.fit.gz']

export type ImportProgress = {
  done: number
  total: number
  label: string
}

type Draft = Activity & { file: string }

type TrackFile = {
  track: [number, number][]
  stream: StreamPoint[]
}

export function parseCsv(text: string): Record<string, string>[] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  const header = rows[0]?.map((name) => name.trim()) ?? []
  if (header.length === 0) return []

  return rows.slice(1).flatMap((values) => {
    if (!values.some((value) => value.trim())) return []
    const record: Record<string, string> = {}
    header.forEach((name, index) => {
      if (!name) return
      const value = values[index] ?? ''
      // Strava repeats Distance. The first value is kilometers; the later one is meters.
      if (record[name] === undefined || value.trim()) record[name] = value
    })
    return [record]
  })
}

export function sportFromType(type: string): Sport {
  const key = type.replace(/[\s_-]/g, '').toLowerCase()
  if (RUN.has(key)) return 'run'
  if (SWIM.has(key)) return 'swim'
  if (RIDE.has(key)) return 'ride'
  return 'other'
}

function numberFrom(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number(value.replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null
  const parsed = Number(value.replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseStravaDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString()
}

export function downsample(track: [number, number][], maxPoints: number): [number, number][] {
  if (track.length <= maxPoints) return track
  const step = (track.length - 1) / (maxPoints - 1)
  const next: [number, number][] = []
  for (let index = 0; index < maxPoints; index += 1) {
    next.push(track[Math.round(index * step)])
  }
  return next
}

/** FIT stores coordinates as semicircles. The parser usually converts them to degrees. */
function toDegrees(value: number): number {
  if (Math.abs(value) <= 180) return value
  return value * (180 / 2147483648)
}

function thin<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints) return items
  const step = (items.length - 1) / (maxPoints - 1)
  const next: T[] = []
  for (let index = 0; index < maxPoints; index += 1) next.push(items[Math.round(index * step)])
  return next
}

function haversine(from: [number, number], to: [number, number]): number {
  const radius = 6371000
  const lat1 = (from[0] * Math.PI) / 180
  const lat2 = (to[0] * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLon = ((to[1] - from[1]) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function parseGpx(xml: string): TrackFile {
  const track: [number, number][] = []
  const raw: Array<{ lat: number; lon: number; t: number | null; alt: number | null; hr: number | null; cad: number | null }> = []
  const pattern = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi
  for (const match of xml.matchAll(pattern)) {
    const attrs = match[1]
    const body = match[2]
    const lat = Number(attrs.match(/\blat="([^"]+)"/i)?.[1])
    const lon = Number(attrs.match(/\blon="([^"]+)"/i)?.[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    track.push([lat, lon])
    const time = body.match(/<time>([^<]+)<\/time>/i)?.[1]
    const parsedTime = time ? Date.parse(time) : Number.NaN
    const ele = Number(body.match(/<ele>([^<]+)<\/ele>/i)?.[1])
    const hr = Number(body.match(/<(?:[\w-]+:)?hr>([^<]+)</i)?.[1])
    const cad = Number(body.match(/<(?:[\w-]+:)?cad>([^<]+)</i)?.[1])
    raw.push({
      lat,
      lon,
      t: Number.isNaN(parsedTime) ? null : parsedTime,
      alt: Number.isFinite(ele) ? ele : null,
      hr: Number.isFinite(hr) && hr > 0 ? hr : null,
      cad: Number.isFinite(cad) && cad > 0 ? cad : null,
    })
  }

  let distance = 0
  const origin = raw.find((point) => point.t !== null)?.t ?? null
  const stream = raw.map((point, index) => {
    if (index > 0) distance += haversine([raw[index - 1].lat, raw[index - 1].lon], [point.lat, point.lon])
    const previous = raw[index - 1]
    const seconds = origin !== null && point.t !== null ? (point.t - origin) / 1000 : index
    let speed: number | null = null
    if (previous && point.t !== null && previous.t !== null && point.t > previous.t) {
      const step = haversine([previous.lat, previous.lon], [point.lat, point.lon])
      speed = step / ((point.t - previous.t) / 1000)
    }
    return { t: seconds, d: distance, alt: point.alt, hr: point.hr, cad: point.cad, speed }
  })

  return { track: downsample(track, 180), stream: thin(stream, 360) }
}

function activitiesFromCsv(rows: Record<string, string>[]): Draft[] {
  return rows.flatMap((row, index) => {
    const date = parseStravaDate(row['Activity Date'] ?? '')
    if (!date) return []
    const type = (row['Activity Type'] || 'Workout').trim() || 'Workout'
    const moving = numberFrom(row['Moving Time'])
    const elapsed = numberFrom(row['Elapsed Time'])
    return [
      {
        id: (row['Activity ID'] || `row-${index + 1}`).trim(),
        name: (row['Activity Name'] || 'Session').trim() || 'Session',
        type,
        sport: sportFromType(type),
        date,
        movingSec: moving || elapsed,
        elapsedSec: elapsed || moving,
        distanceM: numberFrom(row.Distance),
        elevationM: numberFrom(row['Elevation Gain']),
        avgHr: nullableNumber(row['Average Heart Rate']),
        track: [],
        stream: [],
        file: (row.Filename || '').trim(),
      },
    ]
  })
}

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('gzip is not supported in this browser')
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

function optionalNumber(value: number | undefined, acceptZero = true): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (!acceptZero && value <= 0) return null
  return value
}

function parseFit(buffer: ArrayBuffer): Promise<TrackFile> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      mode: 'list',
      lengthUnit: 'm',
      speedUnit: 'm/s',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
    })
    parser.parse(new Uint8Array(buffer), (error, data) => {
      if (error) {
        reject(new Error(error))
        return
      }
      const track: [number, number][] = []
      const stream: StreamPoint[] = []
      for (const record of data.records ?? []) {
        const rawLat = record.position_lat ?? record.positionLat
        const rawLon = record.position_long ?? record.positionLong
        if (typeof rawLat === 'number' && typeof rawLon === 'number') {
          const latitude = toDegrees(rawLat)
          const longitude = toDegrees(rawLon)
          if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) track.push([latitude, longitude])
        }
        const elapsed = optionalNumber(record.elapsed_time)
        const distance = optionalNumber(record.distance)
        if (elapsed === null && distance === null) continue
        stream.push({
          t: elapsed ?? stream.length,
          d: distance ?? stream[stream.length - 1]?.d ?? 0,
          alt: optionalNumber(record.enhanced_altitude ?? record.altitude),
          hr: optionalNumber(record.heart_rate, false),
          cad: optionalNumber(record.cadence, false),
          speed: optionalNumber(record.enhanced_speed ?? record.speed, false),
        })
      }
      resolve({ track: downsample(track, 180), stream: thin(stream, 360) })
    })
  })
}

async function readTrack(bytes: ArrayBuffer, filename: string): Promise<TrackFile> {
  const lower = filename.toLowerCase()
  const payload = lower.endsWith('.gz') ? await gunzip(bytes) : bytes
  const name = lower.replace(/\.gz$/, '')
  if (name.endsWith('.gpx')) return parseGpx(new TextDecoder().decode(payload))
  if (name.endsWith('.fit')) return parseFit(payload)
  return { track: [], stream: [] }
}

function findZipEntry(files: Record<string, JSZip.JSZipObject>, filename: string): JSZip.JSZipObject | null {
  const wanted = filename.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
  if (!wanted) return null
  const entries = Object.entries(files)
  const exact = entries.find(([name, entry]) => !entry.dir && name.replace(/\\/g, '/').toLowerCase() === wanted)
  if (exact) return exact[1]
  const suffix = entries.find(([name, entry]) => !entry.dir && name.replace(/\\/g, '/').toLowerCase().endsWith(`/${wanted}`))
  return suffix?.[1] ?? null
}

export async function readStravaZip(
  file: Blob,
  onProgress?: (progress: ImportProgress) => void,
  source: ImportReport['source'] = 'zip',
): Promise<{ activities: Activity[]; report: ImportReport }> {
  const zip = await JSZip.loadAsync(file)
  const csvEntry = Object.entries(zip.files).find(
    ([name, entry]) => !entry.dir && name.toLowerCase().endsWith('activities.csv'),
  )
  if (!csvEntry) {
    throw new Error('This zip has no activities.csv. Use the export from Strava → Settings → My Account.')
  }

  const drafts = activitiesFromCsv(parseCsv(await csvEntry[1].async('string')))
  if (drafts.length === 0) throw new Error('activities.csv has no dated sessions.')

  let tracks = 0
  let skipped = 0
  let unreadable = 0

  for (let index = 0; index < drafts.length; index += 1) {
    const activity = drafts[index]
    onProgress?.({ done: index, total: drafts.length, label: activity.name })
    const filename = activity.file
    const lower = filename.toLowerCase()
    const supported = TRACK_EXTENSIONS.some((extension) => lower.endsWith(extension))
    if (!filename || !supported) {
      if (filename) skipped += 1
      continue
    }
    const entry = findZipEntry(zip.files, filename)
    if (!entry) {
      skipped += 1
      continue
    }
    try {
      const parsed = await readTrack(await entry.async('arraybuffer'), filename)
      activity.track = parsed.track
      activity.stream = parsed.stream
      if (activity.track.length >= 2) tracks += 1
    } catch {
      unreadable += 1
    }
    if (index % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }

  onProgress?.({ done: drafts.length, total: drafts.length, label: 'Done' })
  const activities = drafts.map(({ file: _file, ...activity }) => activity)
  return {
    activities,
    report: { sessions: activities.length, tracks, skipped, unreadable, source },
  }
}
