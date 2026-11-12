import JSZip from 'jszip'

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400]

function crcUpdate(crc: number, byte: number): number {
  const value = byte & 0xff
  let next = crc & 0xffff
  let tmp = CRC_TABLE[next & 0xf]
  next = (next >> 4) & 0x0fff
  next ^= tmp ^ CRC_TABLE[value & 0xf]
  tmp = CRC_TABLE[next & 0xf]
  next = (next >> 4) & 0x0fff
  next ^= tmp ^ CRC_TABLE[(value >> 4) & 0xf]
  return next & 0xffff
}

function crcBytes(bytes: Uint8Array): number {
  let crc = 0
  for (const byte of bytes) crc = crcUpdate(crc, byte)
  return crc
}

function pushI32(target: number[], value: number) {
  const bits = value | 0
  target.push(bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff)
}

/** Minimal activity FIT so the sample exercises the same parser as a Garmin upload. */
function buildFit(track: [number, number][]): Uint8Array {
  const records: number[] = [
    0x40, 0x00, 0x00, 0x00, 0x00, 1, 0, 1, 0x00, 0x00, 4, 0x41, 0x00, 0x00, 20, 0, 3, 253, 4, 0x8c, 0, 4, 0x85, 1, 4,
    0x85,
  ]
  const fitEpoch = Date.UTC(1989, 11, 31) / 1000
  const start = Math.floor(Date.now() / 1000) - fitEpoch
  track.forEach((point, index) => {
    records.push(0x01)
    pushI32(records, start + index * 10)
    pushI32(records, Math.round(point[0] * (2147483648 / 180)))
    pushI32(records, Math.round(point[1] * (2147483648 / 180)))
  })

  const data = Uint8Array.from(records)
  const header = new Uint8Array(14)
  header[0] = 14
  header[1] = 0x20
  header[2] = 0x54
  header[3] = 0x08
  header[4] = data.length & 0xff
  header[5] = (data.length >> 8) & 0xff
  header[6] = (data.length >> 16) & 0xff
  header[7] = (data.length >> 24) & 0xff
  header.set([0x2e, 0x46, 0x49, 0x54], 8)
  const headerCrc = crcBytes(header.subarray(0, 12))
  header[12] = headerCrc & 0xff
  header[13] = (headerCrc >> 8) & 0xff

  const body = new Uint8Array(header.length + data.length)
  body.set(header)
  body.set(data, header.length)
  const fileCrc = crcBytes(body)
  const file = new Uint8Array(body.length + 2)
  file.set(body)
  file[file.length - 2] = fileCrc & 0xff
  file[file.length - 1] = (fileCrc >> 8) & 0xff
  return file
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = bytes.slice()
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function loop(lat: number, lng: number, radiusKm: number, points = 72): [number, number][] {
  const latScale = radiusKm / 111
  const lngScale = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))
  const track: [number, number][] = []
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2
    const wobble = 1 + 0.16 * Math.sin(angle * 3)
    track.push([
      lat + Math.sin(angle) * latScale * wobble,
      lng + Math.cos(angle * 0.95) * lngScale * (0.86 + 0.18 * Math.cos(angle * 2)),
    ])
  }
  return track
}

function outAndBack(lat: number, lng: number, dLat: number, dLng: number, points = 36): [number, number][] {
  const going: [number, number][] = []
  for (let index = 0; index <= points; index += 1) {
    const t = index / points
    going.push([lat + dLat * t, lng + dLng * t + 0.004 * Math.sin(t * 10)])
  }
  return [...going, ...going.slice(0, -1).reverse()]
}

function gpx(name: string, track: [number, number][], movingSec: number, heartRate: number): string {
  const start = Date.parse('2026-06-01T08:00:00Z')
  const points = track
    .map(([lat, lng], index) => {
      const time = new Date(start + (movingSec * 1000 * index) / Math.max(1, track.length - 1)).toISOString()
      const ele = (240 + 55 * Math.sin(index / 4) + index * 0.4).toFixed(1)
      const hr = Math.max(90, Math.round((heartRate || 140) + 10 * Math.sin(index / 3)))
      const cad = Math.round(168 + 8 * Math.sin(index / 5))
      return `<trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${ele}</ele><time>${time}</time><extensions><gpxtpx:hr>${hr}</gpxtpx:hr><gpxtpx:cad>${cad}</gpxtpx:cad></extensions></trkpt>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><name>${name}</name><trkseg>${points}</trkseg></trk></gpx>`
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

type SampleRow = {
  id: string
  date: string
  name: string
  type: string
  elapsed: number
  moving: number
  distanceM: number
  elevation: number
  hr: string
  filename: string
  track: [number, number][]
  fit?: boolean
}

/**
 * A tiny Strava-shaped export: activities.csv, GPX tracks, and one gzipped FIT.
 * Dates sit across the last year so the period filters have something to show.
 */
export async function buildSampleZip(): Promise<Blob> {
  const rows: SampleRow[] = [
    {
      id: '1001',
      date: '2026-11-08 07:30:00',
      name: 'Semnoz ridge',
      type: 'TrailRun',
      elapsed: 6400,
      moving: 5900,
      distanceM: 14200,
      elevation: 860,
      hr: '148',
      filename: 'activities/1001.gpx',
      track: outAndBack(45.86, 6.1, 0.07, 0.03),
    },
    {
      id: '1002',
      date: '2026-11-02 18:10:00',
      name: 'Evening lake run',
      type: 'Run',
      elapsed: 3100,
      moving: 3000,
      distanceM: 10200,
      elevation: 40,
      hr: '154',
      filename: 'activities/1002.gpx',
      track: loop(45.899, 6.129, 1.6, 64),
    },
    {
      id: '1003',
      date: '2026-10-18 09:05:00',
      name: 'Lake loop, Annecy',
      type: 'Ride',
      elapsed: 5400,
      moving: 5100,
      distanceM: 38600,
      elevation: 220,
      hr: '132',
      filename: 'activities/1003.fit.gz',
      track: loop(45.85, 6.16, 6.2, 90),
      fit: true,
    },
    {
      id: '1004',
      date: '2026-09-12 08:00:00',
      name: 'Parmelan hike',
      type: 'Hike',
      elapsed: 9800,
      moving: 8600,
      distanceM: 12800,
      elevation: 980,
      hr: '',
      filename: 'activities/1004.gpx',
      track: outAndBack(45.94, 6.21, 0.045, 0.02, 28),
    },
    {
      id: '1005',
      date: '2026-07-04 07:15:00',
      name: 'Col de la Forclaz',
      type: 'Ride',
      elapsed: 7200,
      moving: 6800,
      distanceM: 45200,
      elevation: 740,
      hr: '141',
      filename: 'activities/1005.gpx',
      track: loop(45.8, 6.24, 8, 80),
    },
    {
      id: '1006',
      date: '2026-03-21 10:40:00',
      name: 'Spring easy run',
      type: 'Run',
      elapsed: 2500,
      moving: 2400,
      distanceM: 8000,
      elevation: 60,
      hr: '146',
      filename: 'activities/1006.gpx',
      track: loop(45.91, 6.14, 1.3, 50),
    },
    {
      id: '1007',
      date: '2025-06-14 06:50:00',
      name: 'Old tour of the lake',
      type: 'Ride',
      elapsed: 6100,
      moving: 5800,
      distanceM: 42000,
      elevation: 180,
      hr: '128',
      filename: 'activities/1007.gpx',
      track: loop(45.83, 6.18, 7, 70),
    },
  ]

  const header = [
    'Activity ID',
    'Activity Date',
    'Activity Name',
    'Activity Type',
    'Elapsed Time',
    'Distance',
    'Filename',
    'Moving Time',
    'Distance',
    'Elevation Gain',
    'Average Heart Rate',
  ]
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.date,
        csvCell(row.name),
        row.type,
        String(row.elapsed),
        (row.distanceM / 1000).toFixed(2),
        row.filename,
        String(row.moving),
        String(row.distanceM),
        String(row.elevation),
        row.hr,
      ].join(
        ',',
      ),
    )
  }

  const zip = new JSZip()
  zip.file('activities.csv', lines.join('\n'))
  for (const row of rows) {
    if (row.fit) zip.file(row.filename, await gzip(buildFit(row.track)))
    else zip.file(row.filename, gpx(row.name, row.track, row.moving, Number(row.hr) || 140))
  }
  return zip.generateAsync({ type: 'blob' })
}
