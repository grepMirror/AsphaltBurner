import type { StreamPoint } from '../types'

export type Sample = StreamPoint & {
  pace: number | null
  gap: number | null
}

/** Running energy cost vs grade, relative to flat. Uphill makes grade-adjusted pace faster. */
export function gapFactor(grade: number): number {
  const g = Math.max(-0.35, Math.min(0.35, grade))
  const cost = 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6
  return Math.max(0.55, Math.min(2.4, cost / 3.6))
}

export function deriveSamples(stream: StreamPoint[]): Sample[] {
  return stream.map((point, index) => {
    const previous = stream[index - 1]
    let pace: number | null = point.speed !== null && point.speed > 0.7 ? 1000 / point.speed : null
    if (pace === null && previous) {
      const distance = point.d - previous.d
      const seconds = point.t - previous.t
      if (distance > 1 && seconds > 0 && distance / seconds > 0.7) pace = seconds / (distance / 1000)
    }
    if (pace !== null && (pace < 140 || pace > 900)) pace = null

    let gap = pace
    if (pace !== null && previous && point.alt !== null && previous.alt !== null) {
      const distance = point.d - previous.d
      const grade = distance > 4 ? (point.alt - previous.alt) / distance : 0
      gap = pace / gapFactor(grade)
    }
    return { ...point, pace, gap }
  })
}

export function smooth(samples: Sample[], pick: (sample: Sample) => number | null, windowSec = 30): Array<number | null> {
  const half = windowSec / 2
  return samples.map((sample, index) => {
    let sum = 0
    let count = 0
    for (let cursor = index; cursor >= 0 && sample.t - samples[cursor].t <= half; cursor -= 1) {
      const value = pick(samples[cursor])
      if (value === null) continue
      sum += value
      count += 1
    }
    for (let cursor = index + 1; cursor < samples.length && samples[cursor].t - sample.t <= half; cursor += 1) {
      const value = pick(samples[cursor])
      if (value === null) continue
      sum += value
      count += 1
    }
    return count ? sum / count : null
  })
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function sustainedHeartRate(samples: Sample[], windowSec = 60): number | null {
  let left = 0
  let sum = 0
  let count = 0
  let peak: number | null = null
  for (let right = 0; right < samples.length; right += 1) {
    const rightHr = samples[right].hr
    if (rightHr !== null) {
      sum += rightHr
      count += 1
    }
    while (samples[right].t - samples[left].t > windowSec) {
      const leftHr = samples[left].hr
      if (leftHr !== null) {
        sum -= leftHr
        count -= 1
      }
      left += 1
    }
    if (count > 0 && samples[right].t - samples[left].t >= windowSec * 0.8) {
      const average = sum / count
      peak = peak === null ? average : Math.max(peak, average)
    }
  }
  return peak
}

export function formatPace(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const rounded = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(rounded / 60)
  const remain = rounded % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

export type DistanceSplit = {
  label: string
  pace: number
  hr: number | null
  partial: boolean
}

/** Clock pace for each distance block. Default block is 1 km. A short final block is kept when it is at least 200 m. */
export function distanceSplits(samples: Sample[], splitM = 1000): DistanceSplit[] {
  if (samples.length < 2 || splitM < 100) return []
  const end = samples[samples.length - 1].d
  if (end < 200) return []
  const splits: DistanceSplit[] = []
  for (let start = 0; start < end - 80 && splits.length < 120; start += splitM) {
    const stop = Math.min(start + splitM, end)
    const distance = stop - start
    if (distance < 200) continue
    const seconds = timeAtDistance(samples, stop) - timeAtDistance(samples, start)
    if (seconds <= 0) continue
    const pace = seconds / (distance / 1000)
    if (pace < 140 || pace > 1200) continue
    const heart = samples
      .filter((sample) => sample.d >= start && sample.d <= stop)
      .map((sample) => sample.hr)
      .filter((value): value is number => value !== null)
    const partial = distance < splitM * 0.98
    splits.push({
      label: partial ? (stop / 1000).toFixed(1) : `${Math.round(stop / 1000)}`,
      pace,
      hr: heart.length ? heart.reduce((sum, value) => sum + value, 0) / heart.length : null,
      partial,
    })
  }
  return splits
}

function timeAtDistance(samples: Sample[], distance: number): number {
  if (distance <= samples[0].d) return samples[0].t
  const last = samples[samples.length - 1]
  if (distance >= last.d) return last.t
  let low = 0
  let high = samples.length - 1
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2)
    if (samples[mid].d < distance) low = mid
    else high = mid
  }
  const before = samples[low]
  const after = samples[high]
  const span = after.d - before.d
  if (span <= 0) return after.t
  return before.t + ((distance - before.d) / span) * (after.t - before.t)
}

export type PaceBin = {
  label: string
  pace: number
  seconds: number
  hr: number | null
  cadence: number | null
}

export function paceBins(samples: Sample[]): PaceBin[] {
  const steps: Array<{ gap: number; dt: number; hr: number | null; cad: number | null }> = []
  for (let index = 0; index < samples.length - 1; index += 1) {
    const gap = samples[index].gap
    const dt = samples[index + 1].t - samples[index].t
    if (gap === null || dt <= 0 || dt > 20) continue
    steps.push({ gap, dt, hr: samples[index].hr, cad: samples[index].cad })
  }
  if (steps.length === 0) return []
  const min = Math.max(180, Math.min(...steps.map((step) => step.gap)))
  const max = Math.min(720, Math.max(...steps.map((step) => step.gap)))
  const width = 20
  const bins: PaceBin[] = []
  for (let start = Math.floor(min / width) * width; start <= max; start += width) {
    const inside = steps.filter((step) => step.gap >= start && step.gap < start + width)
    if (inside.length === 0) continue
    const heart = inside.map((step) => step.hr).filter((value): value is number => value !== null)
    const cadence = inside.map((step) => step.cad).filter((value): value is number => value !== null)
    bins.push({
      label: formatPace(start + width / 2),
      pace: start + width / 2,
      seconds: inside.reduce((sum, step) => sum + step.dt, 0),
      hr: heart.length ? heart.reduce((sum, value) => sum + value, 0) / heart.length : null,
      cadence: cadence.length ? cadence.reduce((sum, value) => sum + value, 0) / cadence.length : null,
    })
  }
  return bins
}

export type HoldingSlice = {
  label: string
  pace: number | null
  hr: number | null
  last: boolean
}

export function holdingSlices(samples: Sample[], parts = 10): HoldingSlice[] {
  if (samples.length < 2) return []
  const start = samples[0].t
  const end = samples[samples.length - 1].t
  const span = Math.max(1, end - start)
  return Array.from({ length: parts }, (_, index) => {
    const from = start + (span * index) / parts
    const to = start + (span * (index + 1)) / parts
    const inside = samples.filter((sample) => sample.t >= from && sample.t < to + (index === parts - 1 ? 0.001 : 0))
    const paces = inside.map((sample) => sample.gap).filter((value): value is number => value !== null)
    const heart = inside.map((sample) => sample.hr).filter((value): value is number => value !== null)
    return {
      label: `${Math.round((index / parts) * 100)}%`,
      pace: paces.length ? paces.reduce((sum, value) => sum + value, 0) / paces.length : null,
      hr: heart.length ? heart.reduce((sum, value) => sum + value, 0) / heart.length : null,
      last: index >= parts - 2,
    }
  })
}
