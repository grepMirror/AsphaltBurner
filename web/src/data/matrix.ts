export const DIMENSION_ORDER = [
  'endurance',
  'uphill',
  'downhill',
  'speed',
  'resilience',
  'physiology',
] as const

export type DimensionId = (typeof DIMENSION_ORDER)[number]

export type QuickTone = 'cohort' | 'profile' | 'limit' | 'observation'

export type QuickItem = {
  tone: QuickTone
  text: string
}

export type XYPoint = {
  x: number
  y: number
  low?: number
  high?: number
}

export type Series = {
  id: string
  label: string
  summary: string
  points: XYPoint[]
}

export type BarItem = {
  label: string
  value: number
  display?: string
}

export type StackedBar = {
  label: string
  year: number
  parts: number[]
}

export type DimensionMeta = {
  id: DimensionId
  label: string
  score: number
  color: string
  percentile: string
  seeRuns: string
  blurb: string
  quickRead: QuickItem[]
}

export const profile = {
  athlete: 'Bob Razofski',
  plan: 'FREE',
  score: 56,
  archetype: 'Mountain goat',
  description:
    'Gradient plays in your favour. You gain time when the trail goes up and lose it on the flat: climb-heavy courses turn that advantage into minutes.',
  reliability: 14,
  dataDays: 1148,
  note: "Running indicators: your rides don't count towards the scores.",
  cohort: {
    label: 'Your place in the cohort',
    value: 'Top 8% in Uphill',
    href: '/matrix/uphill',
  },
}

export const dimensions: DimensionMeta[] = [
  {
    id: 'endurance',
    label: 'Endurance',
    score: 83,
    color: '#2ad4c8',
    percentile: 'Top 18%',
    seeRuns: 'See runs over 1 h 30',
    blurb:
      'Focused on stability during prolonged effort and the consistency of its link with heart rate.',
    quickRead: [
      {
        tone: 'cohort',
        text: 'Your score puts you ahead of 82% of the cohort, ranked 249 of 1403 runners (all disciplines combined, road and trail).',
      },
      {
        tone: 'profile',
        text: 'This is your highest dimension relative to your own average: +27 points.',
      },
      {
        tone: 'limit',
        text: 'The top fifteenth of your history holds only 3 runs: the trend there is more fragile than at everyday durations.',
      },
    ],
  },
  {
    id: 'uphill',
    label: 'Uphill',
    score: 66.7,
    color: '#3ecf6e',
    percentile: 'Top 8%',
    seeRuns: 'See runs over 300 m of climbing',
    blurb: 'Uphill profile by slope class, from measured ascent segments.',
    quickRead: [
      {
        tone: 'cohort',
        text: 'Your score puts you ahead of 92% of the cohort, ranked 123 of 1459 runners (all disciplines combined, road and trail).',
      },
      {
        tone: 'profile',
        text: 'This dimension sits 10 points above your own average.',
      },
    ],
  },
  {
    id: 'downhill',
    label: 'Downhill',
    score: 68,
    color: '#d6c84a',
    percentile: 'Top 24%',
    seeRuns: 'See runs over 300 m of descent',
    blurb: 'Downhill profile by slope class, from measured descent segments.',
    quickRead: [
      {
        tone: 'cohort',
        text: 'Your score puts you ahead of 76% of the cohort, ranked 338 of 1408 runners (all disciplines combined, road and trail).',
      },
      {
        tone: 'profile',
        text: 'This dimension sits 12 points above your own average.',
      },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    score: 2.1,
    color: '#d9a441',
    percentile: 'Top 100%',
    seeRuns: 'See running sessions',
    blurb: 'Focused on validated records and how they evolve over time.',
    quickRead: [
      {
        tone: 'cohort',
        text: 'Your score puts you ahead of 0% of the cohort, ranked 1489 of 1492 runners (all disciplines combined, road and trail).',
      },
      {
        tone: 'profile',
        text: 'This is your lowest dimension relative to your own average: −54 points.',
      },
      {
        tone: 'limit',
        text: 'Distances not observed: 1 500 m, 3 km, Semi, 30 km, Marathon.',
      },
    ],
  },
  {
    id: 'resilience',
    label: 'Resilience',
    score: 65.7,
    color: '#e06b78',
    percentile: 'Top 82%',
    seeRuns: 'See runs over 1.5 km',
    blurb: 'How recent load sits against your habits, and how well efforts are absorbed.',
    quickRead: [
      {
        tone: 'observation',
        text: 'There is not enough history to compare your recent load.',
      },
      {
        tone: 'observation',
        text: 'No measured run is more than 10% longer than your recent longest run.',
      },
      {
        tone: 'limit',
        text: 'The available history does not yet cover the full reference period.',
      },
    ],
  },
  {
    id: 'physiology',
    label: 'Physiology',
    score: 53,
    color: '#a78bfa',
    percentile: 'Top 47%',
    seeRuns: 'See runs with heart rate',
    blurb: 'What your pace costs in beats, and how quickly heart rate comes back down.',
    quickRead: [
      {
        tone: 'cohort',
        text: 'Your score puts you ahead of 53% of the cohort, ranked 612 of 1304 runners with heart-rate data.',
      },
      {
        tone: 'profile',
        text: 'This dimension sits 3 points under your own average.',
      },
      {
        tone: 'limit',
        text: 'Heart-rate samples are sparse above 1 h 10, so the costly-pace curve flattens there.',
      },
    ],
  },
]

export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

/** Overall matrix score: arithmetic mean of the six dimensions, rounded. */
export function matrixScore(): number {
  const total = dimensions.reduce((sum, dimension) => sum + dimension.score, 0)
  return Math.round(total / dimensions.length)
}

export function dimensionById(id: string): DimensionMeta | undefined {
  return dimensions.find((dimension) => dimension.id === id)
}

export function neighbor(id: DimensionId, step: -1 | 1): DimensionMeta {
  const index = DIMENSION_ORDER.indexOf(id)
  const next = (index + step + DIMENSION_ORDER.length) % DIMENSION_ORDER.length
  return dimensions[next]
}

const effort = (rows: Array<[number, number, number, number]>): XYPoint[] =>
  rows.map(([x, y, low, high]) => ({ x, y, low, high }))

export const enduranceCharts = {
  series: [
    {
      id: 'pace',
      label: 'Pace',
      summary: '16 runs · trend −3.2 pts/h',
      points: effort([
        [5, -2.4, -8.5, 3.2],
        [8, -1.6, -6.2, 3.4],
        [12, -0.4, -4.8, 4.2],
        [18, 0.6, -3.6, 4.8],
        [25, 1.2, -2.8, 5.1],
        [32, 1.8, -2.2, 5.4],
        [40, 2.2, -1.8, 5.2],
        [50, 1.9, -2.4, 4.8],
        [60, 0.6, -3.6, 4.2],
        [75, -1.8, -5.4, 2.4],
        [85, -3.6, -6.8, 0.4],
      ]),
    },
    {
      id: 'cardio',
      label: 'Cardio',
      summary: '14 runs · trend +1.1 bpm',
      points: effort([
        [5, 0.8, -3.2, 4.4],
        [10, 1.4, -2.2, 5.1],
        [18, 2.2, -1.2, 6.2],
        [28, 3.1, -0.4, 6.8],
        [40, 3.6, 0.2, 7.2],
        [55, 4.2, 0.6, 7.6],
        [70, 4.8, 1.1, 8.2],
        [85, 5.4, 1.6, 8.8],
      ]),
    },
    {
      id: 'cadence',
      label: 'Cadence',
      summary: '11 runs · trend −0.4 spm',
      points: effort([
        [5, 1.2, -2.4, 4.2],
        [12, 0.4, -3.1, 3.6],
        [22, -0.6, -4.2, 2.8],
        [35, -1.1, -4.8, 2.2],
        [50, -0.4, -3.6, 2.6],
        [70, 0.2, -3.2, 3.1],
        [85, -0.8, -4.4, 2.4],
      ]),
    },
  ] satisfies Series[],
  dots: {
    pace: [
      { x: 6, y: -11.2 },
      { x: 14, y: -6.4 },
      { x: 22, y: 3.1 },
      { x: 28, y: -2.2 },
      { x: 36, y: 8.4 },
      { x: 48, y: -7.6 },
      { x: 58, y: 2.8 },
      { x: 66, y: -1.4 },
      { x: 78, y: -8.2 },
    ],
    cardio: [
      { x: 8, y: 2.2 },
      { x: 20, y: 6.4 },
      { x: 34, y: 1.1 },
      { x: 46, y: 7.2 },
      { x: 62, y: 3.4 },
      { x: 80, y: 8.1 },
    ],
    cadence: [
      { x: 9, y: 2.8 },
      { x: 24, y: -3.6 },
      { x: 41, y: 1.4 },
      { x: 63, y: -2.2 },
      { x: 82, y: 0.6 },
    ],
  },
  longest: {
    median: 67,
    medianLabel: '1 h 07',
    cutoff: 'Top 15%',
    stats: [
      { label: 'Longest run', value: '1 h 12' },
      { label: 'Runs kept', value: '3' },
      { label: 'Personal cut-off', value: 'Top 15%' },
      { label: 'Median duration', value: '1 h 07' },
    ],
    bars: [
      { label: 'Jul 28', value: 72, display: '1 h 12' },
      { label: 'Aug 5', value: 67, display: '1 h 07' },
      { label: 'Jul 24', value: 66, display: '1 h 06' },
    ] satisfies BarItem[],
  },
}

const slope = (rows: Array<[number, number, number, number]>): XYPoint[] =>
  rows.map(([x, y, low, high]) => ({ x, y, low, high }))

export const gradeCharts = {
  uphill: {
    metricLabel: 'Ascent',
    speedTitle: 'VAM by slope',
    speedSubtitle: 'Median ascent speed by gradient (m/h)',
    speedNote:
      'Descriptive median ascent speed curve by gradient, with a 25th-to-75th percentile band, over 18 genuinely measured bins.',
    yLabel: 'Ascent speed (m/h)',
    histogramTitle: 'Continuous climbs by duration',
    histogramSubtitle: 'Number of observed continuous uphill segments',
    weeklyTitle: 'Weekly elevation gain by slope class',
    weeklySubtitle: 'Elevation gain measured in metres',
    points: slope([
      [0.8, 180, 80, 320],
      [1.6, 280, 140, 460],
      [2.6, 360, 200, 560],
      [3.8, 480, 300, 700],
      [4.8, 620, 400, 860],
      [6.5, 820, 560, 1100],
      [8.5, 1100, 820, 1400],
      [11, 1480, 1100, 1760],
      [13, 1520, 1180, 1860],
      [14.5, 1540, 1200, 1900],
      [16.5, 1280, 980, 1620],
      [18.5, 2100, 1680, 2360],
      [19.5, 1880, 1500, 2200],
      [24.5, 1580, 1240, 1960],
    ]),
    histogram: [
      { label: '2 min', value: 8 },
      { label: '6 min', value: 6 },
      { label: '12 min', value: 5 },
      { label: '20 min', value: 3 },
      { label: '35 min', value: 2 },
      { label: '50 min', value: 1 },
    ] satisfies BarItem[],
    histogramTime: [
      { label: '2 min', value: 14 },
      { label: '6 min', value: 22 },
      { label: '12 min', value: 28 },
      { label: '20 min', value: 24 },
      { label: '35 min', value: 18 },
      { label: '50 min', value: 9 },
    ] satisfies BarItem[],
  },
  downhill: {
    metricLabel: 'Descent',
    speedTitle: 'VDM by slope',
    speedSubtitle: 'Median descent speed by gradient (m/h)',
    speedNote:
      'Descriptive median descent speed curve by gradient, with a 25th-to-75th percentile band, over measured downhill bins.',
    yLabel: 'Descent speed (m/h)',
    histogramTitle: 'Continuous descents by duration',
    histogramSubtitle: 'Number of observed continuous downhill segments',
    weeklyTitle: 'Weekly descent by gradient class',
    weeklySubtitle: 'Descent measured in metres',
    points: slope([
      [0.8, 420, 220, 640],
      [2.2, 680, 420, 920],
      [4.2, 980, 700, 1280],
      [6.5, 1320, 980, 1680],
      [9, 1680, 1280, 2060],
      [12, 1920, 1500, 2320],
      [15, 1760, 1380, 2140],
      [18, 1540, 1180, 1900],
      [22, 1280, 960, 1640],
      [26, 980, 720, 1320],
    ]),
    histogram: [
      { label: '2 min', value: 7 },
      { label: '6 min', value: 5 },
      { label: '12 min', value: 4 },
      { label: '20 min', value: 2 },
      { label: '35 min', value: 1 },
    ] satisfies BarItem[],
    histogramTime: [
      { label: '2 min', value: 11 },
      { label: '6 min', value: 18 },
      { label: '12 min', value: 21 },
      { label: '20 min', value: 16 },
      { label: '35 min', value: 8 },
    ] satisfies BarItem[],
  },
}

export const weeklyByDimension: Record<'uphill' | 'downhill', StackedBar[]> = {
  uphill: [
    { label: 'Jul 7', year: 2022, parts: [80, 140, 60] },
    { label: 'Aug 4', year: 2022, parts: [120, 220, 90] },
    { label: 'Sep 2', year: 2022, parts: [60, 110, 40] },
    { label: 'Apr 8', year: 2023, parts: [140, 260, 180] },
    { label: 'Jun 12', year: 2023, parts: [90, 200, 240] },
    { label: 'Aug 21', year: 2023, parts: [160, 320, 210] },
    { label: 'Sep 14', year: 2023, parts: [70, 150, 90] },
  ],
  downhill: [
    { label: 'Jul 7', year: 2022, parts: [60, 100, 40] },
    { label: 'Aug 4', year: 2022, parts: [90, 160, 70] },
    { label: 'Sep 2', year: 2022, parts: [40, 80, 30] },
    { label: 'Apr 8', year: 2023, parts: [110, 180, 120] },
    { label: 'Jun 12', year: 2023, parts: [70, 140, 160] },
    { label: 'Aug 21', year: 2023, parts: [120, 240, 150] },
    { label: 'Sep 14', year: 2023, parts: [50, 110, 70] },
  ],
}

export const slopeClassLegend = ['0–6%', '6–12%', '12%+']

export const speedCharts = {
  anchors: [
    {
      id: '1',
      label: '1 km',
      points: [
        { x: 1, y: 250 },
        { x: 5, y: 292 },
        { x: 10, y: 318 },
        { x: 15, y: 334 },
      ],
    },
    {
      id: '5',
      label: '5 km',
      points: [
        { x: 1, y: 236 },
        { x: 5, y: 278 },
        { x: 10, y: 304 },
        { x: 15, y: 320 },
      ],
    },
    {
      id: '10',
      label: '10 km',
      points: [
        { x: 1, y: 248 },
        { x: 5, y: 286 },
        { x: 10, y: 312 },
        { x: 15, y: 328 },
      ],
    },
    {
      id: '15',
      label: '15 km',
      points: [
        { x: 1, y: 260 },
        { x: 5, y: 298 },
        { x: 10, y: 324 },
        { x: 15, y: 340 },
      ],
    },
  ],
  envelopeLow: [
    { x: 1, y: 236 },
    { x: 5, y: 274 },
    { x: 10, y: 300 },
    { x: 15, y: 316 },
  ],
  envelopeHigh: [
    { x: 1, y: 268 },
    { x: 5, y: 306 },
    { x: 10, y: 332 },
    { x: 15, y: 348 },
  ],
  records: [
    { x: 1, y: 252, color: '#e06b78' },
    { x: 15, y: 318, color: '#e06b78' },
  ],
  bands: [
    { label: 'Short', score: 43 },
    { label: 'Intermediate', score: 52 },
    { label: 'Long', score: 38 },
    { label: 'Very long', score: null as number | null },
  ],
  byDuration: [
    { id: 'speed', label: 'Speed', points: effortHoldSpeed('speed') },
    { id: 'pace', label: 'Pace', points: effortHoldSpeed('pace') },
  ],
  progression: [
    { x: 2022, y: 352 },
    { x: 2023, y: 338 },
    { x: 2024, y: 326 },
    { x: 2025, y: 318 },
    { x: 2026, y: 312 },
  ],
}

function effortHoldSpeed(mode: 'speed' | 'pace'): XYPoint[] {
  if (mode === 'speed') {
    return [
      { x: 5, y: 13.2 },
      { x: 15, y: 12.4 },
      { x: 30, y: 11.6 },
      { x: 45, y: 11.1 },
      { x: 60, y: 10.6 },
      { x: 90, y: 9.8 },
    ]
  }
  return [
    { x: 5, y: 272 },
    { x: 15, y: 290 },
    { x: 30, y: 310 },
    { x: 45, y: 324 },
    { x: 60, y: 340 },
    { x: 90, y: 368 },
  ]
}

export const resilienceCharts = {
  recentLoad: '13.4 km · Recent load',
  load: [
    { label: 'Aug 10', value: 0.4 },
    { label: 'Aug 17', value: 0.2 },
    { label: 'Sep 7', value: 6.2 },
    { label: 'Sep 14', value: 13.4 },
  ] satisfies BarItem[],
  sessions: [
    { x: 1, y: 11.2 },
    { x: 2, y: 12.4 },
    { x: 3, y: 10.8 },
    { x: 4, y: 9.6 },
    { x: 5, y: 8.2 },
    { x: 6, y: 4.1 },
  ],
  reference: [
    { x: 1, y: 12.6 },
    { x: 3, y: 12.6 },
    { x: 5, y: 11.4 },
    { x: 6, y: 6.2 },
  ],
  durability: [
    { x: 0, y: 100 },
    { x: 20, y: 97 },
    { x: 40, y: 93 },
    { x: 60, y: 88 },
    { x: 80, y: 81 },
    { x: 100, y: 74 },
  ],
  effort: [
    { x: 1, y: 42 },
    { x: 2, y: 55 },
    { x: 3, y: 48 },
    { x: 4, y: 63 },
    { x: 5, y: 51 },
    { x: 6, y: 58 },
  ],
  recovery: [
    { x: 1, y: 28 },
    { x: 2, y: 34 },
    { x: 3, y: 31 },
    { x: 4, y: 40 },
    { x: 5, y: 36 },
    { x: 6, y: 33 },
  ],
  consistency: [
    { label: 'W1', value: 3 },
    { label: 'W2', value: 2 },
    { label: 'W3', value: 4 },
    { label: 'W4', value: 1 },
    { label: 'W5', value: 3 },
    { label: 'W6', value: 4 },
    { label: 'W7', value: 2 },
    { label: 'W8', value: 3 },
  ] satisfies BarItem[],
}

export const physiologyCharts = {
  paceCost: [
    { x: 270, y: 142 },
    { x: 290, y: 148 },
    { x: 310, y: 154 },
    { x: 330, y: 161 },
    { x: 350, y: 168 },
    { x: 370, y: 174 },
    { x: 400, y: 181 },
  ] as XYPoint[],
  paceDots: [
    { x: 280, y: 151 },
    { x: 305, y: 146 },
    { x: 322, y: 166 },
    { x: 348, y: 158 },
    { x: 366, y: 178 },
    { x: 390, y: 172 },
  ],
  recovery: [
    { x: 0, y: 176 },
    { x: 20, y: 154 },
    { x: 40, y: 142 },
    { x: 60, y: 134 },
    { x: 90, y: 126 },
    { x: 120, y: 120 },
  ] as XYPoint[],
  zones: [
    { label: 'Z1', value: 38 },
    { label: 'Z2', value: 27 },
    { label: 'Z3', value: 18 },
    { label: 'Z4', value: 12 },
    { label: 'Z5', value: 5 },
  ] satisfies BarItem[],
}

export function paceLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}
