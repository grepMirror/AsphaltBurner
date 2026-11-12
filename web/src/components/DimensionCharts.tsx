import { useMemo, useState } from 'react'
import {
  enduranceCharts,
  gradeCharts,
  paceLabel,
  physiologyCharts,
  resilienceCharts,
  slopeClassLegend,
  speedCharts,
  weeklyByDimension,
  type DimensionId,
  type DimensionMeta,
} from '../data/matrix'
import { HBars, StackedBars, VBars, XYChart, ZoneBar } from './charts'
import { ChartCard, QuickRead, Segmented, StatRow } from './ui'

const driftTicks = [
  { value: 10, label: '10%' },
  { value: 5, label: '5%' },
  { value: 0, label: '0%' },
  { value: -5, label: '−5%' },
  { value: -10, label: '−10%' },
  { value: -15, label: '−15%' },
]

const durationTicks = [
  { value: 5, label: '5 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 85, label: '1 h 25+' },
]

export function DimensionCharts({ dimension }: { dimension: DimensionMeta }) {
  return (
    <>
      {dimension.id === 'endurance' ? <EnduranceCharts color={dimension.color} /> : null}
      {dimension.id === 'uphill' || dimension.id === 'downhill' ? (
        <GradeCharts id={dimension.id} color={dimension.color} />
      ) : null}
      {dimension.id === 'speed' ? <SpeedCharts color={dimension.color} /> : null}
      {dimension.id === 'resilience' ? <ResilienceCharts color={dimension.color} /> : null}
      {dimension.id === 'physiology' ? <PhysiologyCharts color={dimension.color} /> : null}
      <QuickRead items={dimension.quickRead} />
      {dimension.id === 'endurance' ? <LongestRuns color={dimension.color} /> : null}
      {dimension.id === 'uphill' || dimension.id === 'downhill' ? (
        <GradeLower id={dimension.id} color={dimension.color} />
      ) : null}
      {dimension.id === 'speed' ? <SpeedLower color={dimension.color} /> : null}
      {dimension.id === 'resilience' ? <ResilienceLower color={dimension.color} /> : null}
      {dimension.id === 'physiology' ? <PhysiologyLower color={dimension.color} /> : null}
    </>
  )
}

function EnduranceCharts({ color }: { color: string }) {
  const [seriesId, setSeriesId] = useState(enduranceCharts.series[0].id)
  const series = enduranceCharts.series.find((item) => item.id === seriesId) ?? enduranceCharts.series[0]
  const dots = enduranceCharts.dots[seriesId as keyof typeof enduranceCharts.dots]

  return (
    <ChartCard
      title="Effort hold by duration"
      subtitle="Change between the start and the end of your runs, at comparable gradient"
      aside={
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/60">{series.summary}</span>
          <Segmented
            value={seriesId}
            accent={color}
            onChange={setSeriesId}
            options={enduranceCharts.series.map((item) => ({ id: item.id, label: item.label }))}
          />
        </div>
      }
    >
      <XYChart
        points={series.points}
        xDomain={[5, 85]}
        yDomain={[-16, 12]}
        xTicks={durationTicks}
        yTicks={driftTicks}
        color={color}
        xScale="log"
        xLabel="Run duration (min)"
        yLabel={seriesId === 'pace' ? 'Pace drift (%)' : seriesId === 'cardio' ? 'Cardio drift' : 'Cadence drift'}
        showBand
        dots={[
          ...dots.map((dot) => ({ ...dot, color })),
          { x: 32, y: series.points[4]?.y ?? 0, color, ring: true },
        ]}
        rug={[8, 14, 22, 36, 48, 66, 78]}
      />
      <div className="mt-1 flex justify-end gap-6 text-[11px] text-white/35">
        <span>slowing down late in the run</span>
        <span>0% = steady pace</span>
        <span>speeding up late in the run</span>
      </div>
    </ChartCard>
  )
}

function LongestRuns({ color }: { color: string }) {
  const data = enduranceCharts.longest
  return (
    <ChartCard title="Your longest runs" subtitle="The 3 runs in the longest 15% of your recent history">
      <StatRow
        stats={data.stats.map((stat) =>
          stat.label === 'Personal cut-off' ? { ...stat, hint: 'relative to your own history' } : stat,
        )}
      />
      <HBars
        bars={data.bars}
        max={120}
        color={color}
        marker={data.median}
        markerLabel={`Median · ${data.medianLabel}`}
        ticks={[
          { value: 0, label: '0 h' },
          { value: 60, label: '1 h' },
          { value: 120, label: '2 h+' },
        ]}
      />
    </ChartCard>
  )
}

function GradeCharts({ id, color }: { id: Extract<DimensionId, 'uphill' | 'downhill'>; color: string }) {
  const chart = gradeCharts[id]
  return (
    <ChartCard title={chart.speedTitle} subtitle={chart.speedSubtitle} note={chart.speedNote}>
      <XYChart
        points={chart.points}
        xDomain={[0.5, id === 'uphill' ? 26 : 28]}
        yDomain={[0, 2600]}
        xTicks={[
          { value: 0.8, label: '0.8%' },
          { value: 4.8, label: '4.8%' },
          { value: 12, label: '12%' },
          { value: 18.5, label: '18%' },
          { value: 24.5, label: '24%' },
        ]}
        yTicks={[
          { value: 0, label: '0' },
          { value: 600, label: '600' },
          { value: 1200, label: '1200' },
          { value: 1800, label: '1800' },
          { value: 2400, label: '2400' },
        ]}
        color={color}
        yLabel={chart.yLabel}
        xLabel="Gradient"
        showBand
        showDots
      />
    </ChartCard>
  )
}

function GradeLower({ id, color }: { id: Extract<DimensionId, 'uphill' | 'downhill'>; color: string }) {
  const chart = gradeCharts[id]
  const [metric, setMetric] = useState<'count' | 'time'>('count')
  const [year, setYear] = useState<'all' | '2022' | '2023'>('all')
  const bars = metric === 'count' ? chart.histogram : chart.histogramTime
  const weeks = useMemo(() => {
    const source = weeklyByDimension[id]
    if (year === 'all') return source
    return source.filter((bar) => bar.year === Number(year))
  }, [id, year])
  const shaded = [color, color, color]

  return (
    <>
      <ChartCard
        title={chart.histogramTitle}
        subtitle={chart.histogramSubtitle}
        aside={
          <Segmented
            value={metric}
            accent={color}
            onChange={setMetric}
            options={[
              { id: 'count', label: chart.metricLabel },
              { id: 'time', label: 'Time' },
            ]}
          />
        }
      >
        <VBars bars={bars} color={color} yLabel={metric === 'count' ? 'Segments' : 'Minutes'} />
      </ChartCard>
      <ChartCard
        title={chart.weeklyTitle}
        subtitle={chart.weeklySubtitle}
        aside={
          <Segmented
            value={year}
            accent={color}
            onChange={setYear}
            options={[
              { id: 'all', label: 'All' },
              { id: '2022', label: '2022' },
              { id: '2023', label: '2023' },
            ]}
          />
        }
      >
        <StackedBars bars={weeks} colors={shaded} yLabel="Metres" />
        <div className="mt-2 flex gap-4 text-xs text-white/50">
          {slopeClassLegend.map((label, index) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: color, opacity: 0.55 + index * 0.15 }} />
              {label}
            </span>
          ))}
        </div>
      </ChartCard>
    </>
  )
}

function SpeedCharts({ color }: { color: string }) {
  const [anchor, setAnchor] = useState('10')
  const series = speedCharts.anchors.find((item) => item.id === anchor) ?? speedCharts.anchors[2]
  const paceTicks = [410, 385, 360, 335, 310, 285, 260, 235].map((value) => ({
    value,
    label: paceLabel(value),
  }))

  return (
    <ChartCard
      title="How coherent are your records"
      subtitle="Your records placed on the curve one of them implies"
      aside={
        <div className="flex gap-1">
          {speedCharts.anchors.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAnchor(item.id)}
              className="rounded px-2 py-1 text-xs"
              style={
                item.id === anchor
                  ? { outline: `1px solid ${color}`, color }
                  : { color: 'rgba(255,255,255,0.55)' }
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      <XYChart
        points={series.points}
        xDomain={[0.8, 16]}
        yDomain={[220, 430]}
        xScale="log"
        xTicks={[
          { value: 1, label: '1 km' },
          { value: 5, label: '5 km' },
          { value: 10, label: '10 km' },
          { value: 15, label: '15 km' },
        ]}
        yTicks={paceTicks}
        color={color}
        yLabel="Pace (min/km)"
        xLabel="Distance"
        extraLines={[
          { points: speedCharts.envelopeLow, color: '#166534', width: 8 },
          { points: speedCharts.envelopeHigh, color: '#7f1d1d', width: 8 },
        ]}
        dots={speedCharts.records}
      />
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: color }} /> Curve implied by the {series.label}
        </span>
        <span>1.04–1.08 envelope</span>
        <span className="text-emerald-400">faster than predicted</span>
        <span className="text-red-400">slower</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {speedCharts.bands.map((band) => (
          <span key={band.label} className="rounded border border-white/10 px-2 py-1 text-xs text-white/70">
            {band.label} {band.score ?? '—'}
          </span>
        ))}
      </div>
    </ChartCard>
  )
}

function SpeedLower({ color }: { color: string }) {
  const [mode, setMode] = useState<'speed' | 'pace'>('speed')
  const series = speedCharts.byDuration.find((item) => item.id === mode) ?? speedCharts.byDuration[0]
  const speedMode = mode === 'speed'

  return (
    <>
      <ChartCard
        title="Your speed by effort duration"
        subtitle="How pace holds as the effort gets longer"
        aside={
          <Segmented
            value={mode}
            accent={color}
            onChange={setMode}
            options={[
              { id: 'speed', label: 'Speed' },
              { id: 'pace', label: 'Pace' },
            ]}
          />
        }
      >
        <XYChart
          points={series.points}
          xDomain={[5, 90]}
          yDomain={speedMode ? [8, 15] : [250, 400]}
          xTicks={[
            { value: 5, label: '5 min' },
            { value: 30, label: '30 min' },
            { value: 60, label: '1 h' },
            { value: 90, label: '1 h 30' },
          ]}
          yTicks={
            speedMode
              ? [
                  { value: 14, label: '14' },
                  { value: 12, label: '12' },
                  { value: 10, label: '10' },
                  { value: 8, label: '8 km/h' },
                ]
              : [
                  { value: 270, label: paceLabel(270) },
                  { value: 320, label: paceLabel(320) },
                  { value: 370, label: paceLabel(370) },
                ]
          }
          color={color}
          xLabel="Effort duration"
          yLabel={speedMode ? 'Speed (km/h)' : 'Pace'}
          showDots
        />
      </ChartCard>
      <ChartCard title="Record progression" subtitle="Best pace at the anchor distance, year by year">
        <XYChart
          points={speedCharts.progression}
          xDomain={[2022, 2026]}
          yDomain={[280, 380]}
          xTicks={[2022, 2023, 2024, 2025, 2026].map((year) => ({ value: year, label: String(year) }))}
          yTicks={[
            { value: 300, label: paceLabel(300) },
            { value: 330, label: paceLabel(330) },
            { value: 360, label: paceLabel(360) },
          ]}
          color={color}
          xLabel="Year"
          yLabel="Pace"
          showDots
        />
      </ChartCard>
    </>
  )
}

function ResilienceCharts({ color }: { color: string }) {
  return (
    <ChartCard
      title="Recent load vs habits"
      subtitle="Weekly distance and personal range from the previous four windows"
      aside={<span className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/60">{resilienceCharts.recentLoad}</span>}
    >
      <VBars bars={resilienceCharts.load} color={color} yLabel="km" yMax={16} />
    </ChartCard>
  )
}

function ResilienceLower({ color }: { color: string }) {
  return (
    <>
      <ChartCard
        title="Recent sessions vs reference"
        subtitle="Up to 12 recent sessions: distance compared with the longest run in the previous 30 days"
      >
        <XYChart
          points={resilienceCharts.sessions}
          xDomain={[1, 6]}
          yDomain={[0, 16]}
          xTicks={[1, 2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) }))}
          yTicks={[
            { value: 0, label: '0' },
            { value: 8, label: '8 km' },
            { value: 16, label: '16 km' },
          ]}
          color={color}
          showLine={false}
          dots={resilienceCharts.sessions.map((point) => ({ ...point, color }))}
          extraLines={[{ points: resilienceCharts.reference, color: 'rgba(255,255,255,0.45)', dashed: true }]}
          xLabel="Session"
          yLabel="Distance"
        />
      </ChartCard>
      <ChartCard title="Observed durability" subtitle="How output holds from the start of the effort to the end">
        <XYChart
          points={resilienceCharts.durability}
          xDomain={[0, 100]}
          yDomain={[60, 100]}
          xTicks={[
            { value: 0, label: 'Start' },
            { value: 50, label: 'Mid' },
            { value: 100, label: 'End' },
          ]}
          yTicks={[
            { value: 100, label: '100%' },
            { value: 80, label: '80%' },
            { value: 60, label: '60%' },
          ]}
          color={color}
          xLabel="Effort"
          yLabel="Output"
        />
      </ChartCard>
      <ChartCard title="Effort and recovery" subtitle="Session load against the ease of the following day">
        <XYChart
          points={resilienceCharts.effort}
          xDomain={[1, 6]}
          yDomain={[0, 80]}
          xTicks={[1, 2, 3, 4, 5, 6].map((value) => ({ value, label: `S${value}` }))}
          yTicks={[
            { value: 0, label: '0' },
            { value: 40, label: '40' },
            { value: 80, label: '80' },
          ]}
          color={color}
          extraLines={[{ points: resilienceCharts.recovery, color: '#7dd3fc' }]}
          xLabel="Session"
          yLabel="Load"
          showDots
        />
        <div className="mt-2 flex gap-4 text-xs text-white/50">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: color }} /> Effort
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-sky-300" /> Recovery
          </span>
        </div>
      </ChartCard>
      <ChartCard title="Consistency" subtitle="Runs per week across the recent block">
        <VBars bars={resilienceCharts.consistency} color={color} yLabel="Runs" yMax={5} />
      </ChartCard>
    </>
  )
}

function PhysiologyCharts({ color }: { color: string }) {
  return (
    <ChartCard
      title="What does your pace cost, in beats?"
      subtitle="Aggregated history: cannot be filtered by period"
    >
      <XYChart
        points={physiologyCharts.paceCost}
        xDomain={[260, 410]}
        yDomain={[130, 190]}
        xTicks={[270, 310, 350, 390].map((value) => ({ value, label: paceLabel(value) }))}
        yTicks={[
          { value: 140, label: '140' },
          { value: 160, label: '160' },
          { value: 180, label: '180 bpm' },
        ]}
        color={color}
        dots={physiologyCharts.paceDots.map((dot) => ({ ...dot, color }))}
        xLabel="Pace"
        yLabel="Heart rate"
      />
    </ChartCard>
  )
}

function PhysiologyLower({ color }: { color: string }) {
  return (
    <>
      <ChartCard title="Heart-rate recovery after effort" subtitle="Beats in the two minutes after a hard segment">
        <XYChart
          points={physiologyCharts.recovery}
          xDomain={[0, 120]}
          yDomain={[110, 190]}
          xTicks={[
            { value: 0, label: '0 s' },
            { value: 60, label: '60 s' },
            { value: 120, label: '120 s' },
          ]}
          yTicks={[
            { value: 120, label: '120' },
            { value: 150, label: '150' },
            { value: 180, label: '180 bpm' },
          ]}
          color={color}
          xLabel="Time after effort"
          yLabel="Heart rate"
          showDots
        />
      </ChartCard>
      <ChartCard title="Time in heart-rate zones (Karvonen)" subtitle="Share of measured time in each zone">
        <ZoneBar bars={physiologyCharts.zones} color={color} />
      </ChartCard>
    </>
  )
}
