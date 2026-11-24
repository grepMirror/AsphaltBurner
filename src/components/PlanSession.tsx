import { useEffect, useState, type ReactNode } from 'react'
import { InfoChips, type InfoChip } from './InfoChips'
import { SportIcon } from './SportIcon'
import { formatDistance, formatDuration, formatPaceOrSpeed, formatWhen } from '../lib/format'
import {
  SESSION_TAGS,
  blockTotals,
  cloneBlocks,
  defaultBlocks,
  formatClock,
  formatSpan,
  isBlock,
  isHard,
  isSimple,
  lastWeekMean,
  parseClock,
  shiftWeek,
  simpleBlocks,
  step,
  stepLabel,
  tagOf,
  totalsText,
  weekFacts,
  weekRuns,
  blocksSummary,
  type Block,
  type Measure,
  type PlannedSession,
  type SessionTag,
  type Step,
  type StepKind,
  type ZonePace,
} from '../lib/plan'
import { formatPace } from '../lib/series'
import type { Activity } from '../types'

export const TAG_COLOR: Record<SessionTag, string> = {
  ef: '#7DD3C7',
  vma: '#F07167',
  long: '#E8C47C',
  threshold: '#F0A05A',
  climb: '#9BB8F0',
}

const KIND_LABEL: Record<StepKind, string> = { warmup: 'Warm up', active: 'Active', recover: 'Recover' }
const KIND_COLOR: Record<Exclude<StepKind, 'active'>, string> = { warmup: '#5EB0C8', recover: '#4A5264' }
const TIME_PRESETS = [30, 45, 60, 75, 90]
const KM_PRESETS = [5, 8, 10, 12, 15]

function paceText(kmh: number): string {
  return formatPace(3600 / kmh)
}

export function SessionEditor({
  initial,
  isNew,
  plan,
  pace,
  activities,
  onBack,
  onSave,
  onDelete,
}: {
  initial: PlannedSession
  isNew: boolean
  plan: PlannedSession[]
  pace: ZonePace | null
  /** Runs by id, to show what was really done last week. */
  activities: ReadonlyMap<string, Activity>
  onBack: () => void
  onSave: (session: PlannedSession) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const kmh = pace?.mid ?? null
  const totals = totalsText(draft.blocks, draft.tag, kmh)
  const setBlocks = (blocks: Block[]) => setDraft((current) => ({ ...current, blocks }))

  const pickTag = (tag: SessionTag) =>
    setDraft((current) => {
      if (tag === current.tag) return current
      let blocks = current.blocks
      if (isSimple(tag) && !isSimple(current.tag)) blocks = simpleBlocks(Math.round((blockTotals(current.blocks, kmh).seconds ?? 2700) / 60) * 60)
      if (!isSimple(tag) && isSimple(current.tag)) blocks = defaultBlocks(tag)
      return { ...current, tag, blocks }
    })

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink onClick={onBack} />
      <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">{isNew ? 'New session' : 'Edit session'}</p>
      <div className="mt-4 flex flex-col gap-4">
        <SportPicker />
        <TagPicker value={draft.tag} onChange={pickTag} />
      </div>
      <div className="mt-6 flex items-end justify-between gap-4 border-t border-[#1E2330] pt-5">
        <span className="font-display text-5xl font-semibold leading-none tabular-nums">{totals.time}</span>
        <span className="font-display text-2xl font-semibold tabular-nums text-[#C5CAD3]">{totals.distance}</span>
      </div>
      <WorkoutStrip blocks={draft.blocks} tag={draft.tag} kmh={kmh} className="mt-4" />
      {isSimple(draft.tag) ? (
        <SimpleEditor draft={draft} plan={plan} pace={pace} activities={activities} onBlocks={setBlocks} />
      ) : (
        <WorkoutCreator draft={draft} plan={plan} pace={pace} activities={activities} onBlocks={setBlocks} />
      )}
      <div className="mt-8 flex flex-col gap-2">
        <button type="button" onClick={() => onSave(draft)} className="w-full rounded-2xl bg-[#E8EAF0] py-3 text-sm font-semibold text-[#0B0D12]">
          {isNew ? 'Add to week' : 'Save'}
        </button>
        {isNew ? null : (
          <button type="button" onClick={onDelete} className="w-full py-2 text-sm text-[#9AA3B5] hover:text-[#E7A3A3]">
            Delete session
          </button>
        )}
      </div>
    </div>
  )
}

export function SessionViewer({
  session,
  activity,
  kmh,
  onBack,
  onTag,
  onEdit,
  onUncomplete,
  onOpenActivity,
}: {
  session: PlannedSession
  activity: Activity | null
  kmh: number | null
  onBack: () => void
  onTag: (tag: SessionTag) => void
  onEdit: () => void
  onUncomplete: () => void
  onOpenActivity: (id: string) => void
}) {
  const totals = totalsText(session.blocks, session.tag, kmh)
  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink onClick={onBack} />
      <p className="mt-6 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#9DDBC0]">
        <CheckIcon />
        Completed
      </p>
      <div className="mt-4">
        <TagPicker value={session.tag} onChange={onTag} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="Planned" value={totals.time} sub={totals.distance} />
        <Stat label="Realized" value={activity ? formatDuration(activity.movingSec) : '—'} sub={activity ? formatDistance(activity.distanceM) : 'No activity linked'} />
      </div>

      <Section label="Activity realized">
        {activity ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#1E2330] bg-[#12161E] p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{activity.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-[#9AA3B5]">
                <SportIcon sport={activity.sport} className="h-3.5 w-3.5" />
                {formatWhen(activity.date)} · {formatPaceOrSpeed(activity)} · {Math.round(activity.elevationM)} m
              </p>
            </div>
            <button type="button" onClick={() => onOpenActivity(activity.id)} className="shrink-0 rounded-xl bg-[#E8EAF0] px-3 py-2 text-sm font-semibold text-[#0B0D12]">
              Open
            </button>
          </div>
        ) : (
          <p className="text-sm text-[#9AA3B5]">Completed without an activity.</p>
        )}
      </Section>

      <Section label="Session created" action={<TextButton onClick={onEdit}>Edit</TextButton>}>
        <div className="rounded-2xl border border-[#1E2330] bg-[#0F1218] p-4">
          <WorkoutStrip blocks={session.blocks} tag={session.tag} kmh={kmh} />
          <ol className="mt-4 flex flex-col gap-2">
            {session.blocks.map((block, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <span className="w-9 shrink-0 pt-0.5 text-right text-xs tabular-nums text-[#9AA3B5]">{block.repeat > 1 ? `${block.repeat}×` : ''}</span>
                <StepList block={block} tag={session.tag} />
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <button type="button" onClick={onUncomplete} className="mt-8 w-full py-2 text-sm text-[#9AA3B5] hover:text-white">
        Mark as not completed
      </button>
    </div>
  )
}

function StepList({ block, tag }: { block: Block; tag: SessionTag }) {
  return (
    <span className="flex flex-col gap-1">
      {block.steps.map((item, index) =>
        isBlock(item) ? (
          <span key={index} className="flex items-start gap-2">
            <span className="w-9 shrink-0 pt-0.5 text-right text-xs tabular-nums text-[#9AA3B5]">{item.repeat > 1 ? `${item.repeat}×` : ''}</span>
            <StepList block={item} tag={tag} />
          </span>
        ) : (
          <span key={index} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: kindColor(item.kind, tag) }} />
            <span className="text-[#C5CAD3]">{isSimple(tag) ? tagOf(tag).label : KIND_LABEL[item.kind]}</span>
            <span className="tabular-nums">{stepLabel(item)}</span>
            {item.pace ? <span className="text-xs tabular-nums text-[#9AA3B5]">@ {formatPace(item.pace)}/km</span> : null}
          </span>
        ),
      )}
    </span>
  )
}

function SimpleEditor({ draft, plan, pace, activities, onBlocks }: { draft: PlannedSession; plan: PlannedSession[]; pace: ZonePace | null; activities: ReadonlyMap<string, Activity>; onBlocks: (blocks: Block[]) => void }) {
  const kmh = pace?.mid ?? null
  const head = draft.blocks[0]?.steps[0]
  const current = head && !isBlock(head) ? head : step('active', 'time', 2700)
  const setStep = (next: Step) => onBlocks([{ repeat: 1, steps: [next] }])
  const mean = lastWeekMean(plan, draft.week, draft.tag, kmh, draft.id, (id) => {
    const run = activities.get(id)
    return run ? { seconds: run.movingSec, meters: run.distanceM } : null
  })
  const label = tagOf(draft.tag).label
  const byTime = current.by === 'time'

  const switchTo = (by: Measure) => {
    if (by === current.by) return
    if (by === 'km') setStep({ ...current, by, value: kmh ? Math.max(500, Math.round((current.value * kmh) / 3.6 / 500) * 500) : 8000 })
    else setStep({ ...current, by, value: kmh ? Math.max(300, Math.round(current.value / (kmh / 3.6) / 300) * 300) : 2700 })
  }
  const unit = byTime ? 60 : 1000
  const stepSize = byTime ? 300 : 500
  const nudge = (sign: number) => setStep({ ...current, value: Math.max(stepSize, current.value + sign * stepSize) })

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <InfoCard label={`${label} last week`}>
          {mean ? (
            <>
              <span className="tabular-nums">avg {mean.seconds != null ? formatSpan(mean.seconds) : '—'}</span>
              <span className="text-[#9AA3B5]">
                {mean.meters != null ? ` · ${mean.done === mean.count ? '' : '≈ '}${formatDistance(mean.meters)}` : ''} · {mean.count} {mean.count === 1 ? 'session' : 'sessions'}
                {mean.done > 0 ? ` · ${mean.done === mean.count ? 'done' : `${mean.done} done`}` : mean.count > 0 ? ' · planned' : ''}
              </span>
            </>
          ) : (
            <span className="text-[#9AA3B5]">No {label} planned last week</span>
          )}
        </InfoCard>
        <InfoCard label="Zone 1 · 90 days">
          {pace ? (
            <span className="tabular-nums">
              {paceText(pace.low)} – {paceText(pace.high)} <span className="text-[#9AA3B5]">/km</span>
            </span>
          ) : (
            <span className="text-[#9AA3B5]">Import runs with heart rate</span>
          )}
        </InfoCard>
      </div>

      <div className="mt-3 rounded-2xl border border-[#1E2330] bg-[#0F1218] p-5">
        <div className="flex justify-center">
          <Toggle
            label="Measure"
            value={current.by}
            options={[
              { id: 'time', label: 'Time' },
              { id: 'km', label: 'Distance' },
            ]}
            onChange={switchTo}
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-5">
          <RoundButton label={byTime ? '5 minutes less' : '500 m less'} onClick={() => nudge(-1)}>
            −
          </RoundButton>
          <div className="w-32 text-center">
            <Field
              key={current.by}
              label={byTime ? 'Duration in minutes' : 'Distance in km'}
              value={current.value}
              format={(value) => (byTime ? String(Math.round(value / 60)) : String(parseFloat((value / 1000).toFixed(1))))}
              parse={(text) => {
                const parsed = Number(text.replace(',', '.'))
                return Number.isFinite(parsed) && parsed > 0 ? Math.min(byTime ? 360 : 100, parsed) * unit : null
              }}
              onCommit={(value) => value != null && setStep({ ...current, value })}
              className="justify-center"
              inputClass="w-full text-center font-display text-5xl font-semibold"
            />
            <span className="mt-1 block text-xs text-[#9AA3B5]">{byTime ? 'minutes' : 'km'}</span>
          </div>
          <RoundButton label={byTime ? '5 minutes more' : '500 m more'} onClick={() => nudge(1)}>
            +
          </RoundButton>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {(byTime ? TIME_PRESETS : KM_PRESETS).map((preset) => {
            const on = current.value === preset * unit
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={on}
                onClick={() => setStep({ ...current, value: preset * unit })}
                className={`rounded-full px-3 py-1.5 text-xs tabular-nums ${on ? 'bg-white/10 text-[#E8EAF0]' : 'text-[#9AA3B5] hover:text-[#E8EAF0]'}`}
              >
                {preset}
                {byTime ? '′' : ' km'}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

/** Seconds as a runner reads them: whole minutes once past ten minutes. */
function spanOf(seconds: number): string {
  return formatSpan(seconds >= 600 ? Math.round(seconds / 60) * 60 : seconds)
}

function runLine(run: Activity): string {
  return `${spanOf(run.movingSec)} · ${formatDistance(run.distanceM)} · ${formatPaceOrSpeed(run)} · ${Math.round(run.elevationM)} m`
}

/** The main facts of a session for a chip card: what was realized when a run is linked, the plan otherwise. */
function SessionBrief({ session, run, kmh }: { session: PlannedSession; run: Activity | null; kmh: number | null }) {
  const totals = totalsText(session.blocks, session.tag, kmh)
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: TAG_COLOR[session.tag] }}>
          {tagOf(session.tag).label}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9AA3B5]">{session.status === 'done' ? 'Completed' : 'Planned'}</span>
      </p>
      {run ? (
        <>
          <p className="truncate text-[#C5CAD3]">{run.name}</p>
          <p className="tabular-nums text-[#E8EAF0]">{runLine(run)}</p>
          <p className="tabular-nums text-[#9AA3B5]">
            Planned {totals.time} · {totals.distance}
          </p>
        </>
      ) : (
        <>
          {isSimple(session.tag) ? null : <p className="text-[#C5CAD3]">{blocksSummary(session.blocks)}</p>}
          <p className="tabular-nums text-[#E8EAF0]">
            {totals.time} · {totals.distance}
          </p>
          {session.status === 'done' ? <p className="text-[#9AA3B5]">No run linked</p> : null}
        </>
      )}
    </div>
  )
}

function WorkoutCreator({
  draft,
  plan,
  pace,
  activities,
  onBlocks,
}: {
  draft: PlannedSession
  plan: PlannedSession[]
  pace: ZonePace | null
  activities: ReadonlyMap<string, Activity>
  onBlocks: (blocks: Block[]) => void
}) {
  const kmh = pace?.mid ?? null
  const realized = (session: PlannedSession) => (session.status === 'done' && session.activityId ? (activities.get(session.activityId) ?? null) : null)
  const color = TAG_COLOR[draft.tag]
  const previous = shiftWeek(draft.week, -1)
  const [showLast, setShowLast] = useState(false)
  // The whole of last week, counted like the week list: the plan for a planned session, the run for a completed one.
  const lastWeek = weekFacts(plan, previous, kmh, [...activities.values()])
  const shared = draft.tag === 'vma' || draft.tag === 'threshold'
  const templates = plan
    .filter((session) => session.week === previous && (shared ? session.tag === 'vma' || session.tag === 'threshold' : session.tag === draft.tag) && session.status !== 'cancelled' && session.id !== draft.id)
    .slice(0, 8)
  const zoneHint = pace ? paceText(pace.mid) : undefined

  // Everything of this week, whatever the type: planned sessions, completed ones, and runs not linked to a session.
  const linked = new Set(plan.map((session) => session.activityId).filter((id): id is string => id !== null))
  const chips: InfoChip[] = [
    ...plan
      .filter((session) => session.week === draft.week && session.status !== 'cancelled' && session.id !== draft.id)
      .map((session) => ({
        id: session.id,
        label: tagOf(session.tag).label,
        color: TAG_COLOR[session.tag],
        done: session.status === 'done',
        body: <SessionBrief session={session} run={realized(session)} kmh={kmh} />,
      })),
    ...weekRuns([...activities.values()], draft.week)
      .filter((run) => !linked.has(run.id))
      .map((run) => ({
        id: run.id,
        label: 'Run',
        color: '#9AA3B5',
        done: true,
        body: (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-[#E8EAF0]">{run.name}</span>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9AA3B5]">Not planned</span>
            </p>
            <p className="tabular-nums text-[#E8EAF0]">{runLine(run)}</p>
          </div>
        ),
      })),
  ]

  const setBlock = (index: number, block: Block) => onBlocks(draft.blocks.map((item, itemIndex) => (itemIndex === index ? block : item)))
  const dropBlock = (index: number) => onBlocks(draft.blocks.filter((_, itemIndex) => itemIndex !== index))
  const moveBlock = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= draft.blocks.length) return
    const next = draft.blocks.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    onBlocks(next)
  }
  const add = (block: Block) => onBlocks([...draft.blocks, block])

  return (
    <>
      <Section label={shared ? 'VMA & Threshold last week' : `${tagOf(draft.tag).label} last week`} fold={{ open: showLast, onToggle: () => setShowLast((value) => !value) }}
        action={
          lastWeek.count > 0 ? (
            <span title="Everything of last week, planned and completed" className="text-xs font-semibold tabular-nums text-[#C5CAD3]">
              {lastWeek.meters == null ? '—' : `${lastWeek.estimated ? '≈ ' : ''}${formatDistance(lastWeek.meters)}`}
              <span className="px-1.5 text-[#5A6275]">·</span>
              {lastWeek.seconds == null ? '—' : formatDuration(lastWeek.seconds)}
            </span>
          ) : null
        }
      >
        {templates.length === 0 ? (
          <p className="text-sm text-[#9AA3B5]">Nothing to reuse from last week.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((session) => {
              const totals = totalsText(session.blocks, session.tag, kmh)
              const run = realized(session)
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onBlocks(cloneBlocks(session.blocks))}
                  className="group flex flex-col gap-2 rounded-2xl border border-[#1E2330] bg-[#0F1218] p-3 text-left hover:border-[#3A4150]"
                >
                  <WorkoutStrip blocks={session.blocks} tag={session.tag} kmh={kmh} small />
                  <span className="truncate text-xs text-[#C5CAD3]">
                    {shared ? <span style={{ color: TAG_COLOR[session.tag] }}>{tagOf(session.tag).label} · </span> : null}
                    {blocksSummary(session.blocks)}
                  </span>
                  <span className="flex items-center justify-between text-xs text-[#9AA3B5]">
                    <span className="tabular-nums">
                      {totals.time} · {totals.distance}
                    </span>
                    <span className="font-semibold text-[#E8EAF0] opacity-60 group-hover:opacity-100">Use</span>
                  </span>
                  {run ? (
                    <span className="flex items-center gap-1.5 text-xs tabular-nums text-[#9DDBC0]">
                      <CheckIcon />
                      Realized {spanOf(run.movingSec)} · {formatDistance(run.distanceM)}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </Section>

      {chips.length > 0 ? (
        <Section label="This week · hover or hold for the details">
          <InfoChips chips={chips} />
        </Section>
      ) : null}

      <Section label="Workout">
        <div className="flex flex-col gap-2">
          {draft.blocks.map((block, index) => (
            <BlockCard
              key={index}
              block={block}
              color={color}
              kmh={kmh}
              zoneHint={zoneHint}
              first={index === 0}
              last={index === draft.blocks.length - 1}
              onChange={(next) => setBlock(index, next)}
              onRemove={() => dropBlock(index)}
              onMove={(delta) => moveBlock(index, delta)}
            />
          ))}
          {draft.blocks.length === 0 ? <p className="rounded-2xl border border-dashed border-[#262C3B] p-4 text-center text-sm text-[#9AA3B5]">Add a first step.</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <AddButton onClick={() => add({ repeat: 1, steps: [step('warmup', 'time', 900)] })}>Warm up</AddButton>
          <AddButton onClick={() => add({ repeat: 1, steps: [step('active', 'time', 600)] })}>Active</AddButton>
          <AddButton onClick={() => add({ repeat: 1, steps: [step('recover', 'time', 300)] })}>Recover</AddButton>
          <AddButton onClick={() => add({ repeat: 6, steps: [step('active', 'km', 400), step('recover', 'time', 90)] })}>Intervals</AddButton>
        </div>
      </Section>
    </>
  )
}

function BlockCard({
  block,
  color,
  kmh,
  zoneHint,
  first,
  last,
  depth = 0,
  onChange,
  onRemove,
  onMove,
}: {
  block: Block
  color: string
  kmh: number | null
  zoneHint?: string
  first: boolean
  last: boolean
  depth?: number
  onChange: (block: Block) => void
  onRemove: () => void
  onMove: (delta: number) => void
}) {
  const interval = block.repeat > 1 || block.steps.length > 1
  const setItem = (index: number, next: Step | Block) => onChange({ ...block, steps: block.steps.map((item, itemIndex) => (itemIndex === index ? next : item)) })
  const dropItem = (index: number) => (block.steps.length === 1 ? onRemove() : onChange({ ...block, steps: block.steps.filter((_, itemIndex) => itemIndex !== index) }))
  const moveItem = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= block.steps.length) return
    const steps = block.steps.slice()
    ;[steps[index], steps[target]] = [steps[target], steps[index]]
    onChange({ ...block, steps })
  }
  const order = (
    <span className="flex">
      <IconButton label="Move up" disabled={first} onClick={() => onMove(-1)}>
        <Arrow up />
      </IconButton>
      <IconButton label="Move down" disabled={last} onClick={() => onMove(1)}>
        <Arrow />
      </IconButton>
    </span>
  )

  return (
    <div className={interval ? 'rounded-2xl border border-[#262C3B] bg-[#0F1218] p-2.5' : ''}>
      {interval ? (
        <div className="mb-2 flex items-center justify-between gap-2 pl-1">
          <div className="flex items-center gap-2">
            <RoundButton small label="One repeat less" onClick={() => onChange({ ...block, repeat: Math.max(1, block.repeat - 1) })}>
              −
            </RoundButton>
            <span className="min-w-[2.5rem] text-center font-display text-lg font-semibold tabular-nums">{block.repeat}×</span>
            <RoundButton small label="One repeat more" onClick={() => onChange({ ...block, repeat: Math.min(50, block.repeat + 1) })}>
              +
            </RoundButton>
          </div>
          <span className="flex items-center">
            {order}
            <IconButton label="Remove intervals" onClick={onRemove}>
              <CloseIcon />
            </IconButton>
          </span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {block.steps.map((item, index) =>
          isBlock(item) ? (
            <BlockCard
              key={index}
              block={item}
              color={color}
              kmh={kmh}
              zoneHint={zoneHint}
              depth={depth + 1}
              first={index === 0}
              last={index === block.steps.length - 1}
              onChange={(next) => setItem(index, next)}
              onRemove={() => dropItem(index)}
              onMove={(delta) => moveItem(index, delta)}
            />
          ) : (
            <StepRow key={index} step={item} color={color} kmh={kmh} zoneHint={zoneHint} order={interval ? null : order} onChange={(next) => setItem(index, next)} onRemove={() => dropItem(index)} />
          ),
        )}
      </div>
      {interval ? (
        <div className="mt-2 flex gap-3 px-1">
          <button type="button" onClick={() => onChange({ ...block, steps: [...block.steps, step('recover', 'time', 60)] })} className="text-xs font-semibold text-[#9AA3B5] hover:text-[#E8EAF0]">
            + Step
          </button>
          {depth < 1 ? (
            <button
              type="button"
              onClick={() => onChange({ ...block, steps: [...block.steps, { repeat: 3, steps: [step('active', 'km', 200), step('recover', 'time', 45)] }] })}
              className="text-xs font-semibold text-[#9AA3B5] hover:text-[#E8EAF0]"
            >
              + Intervals
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function StepRow({
  step: item,
  color,
  kmh,
  zoneHint,
  order,
  onChange,
  onRemove,
}: {
  step: Step
  color: string
  kmh: number | null
  zoneHint?: string
  order: ReactNode
  onChange: (step: Step) => void
  onRemove: () => void
}) {
  const accent = item.kind === 'active' ? color : KIND_COLOR[item.kind]
  const switchTo = (by: Measure) => {
    if (by === item.by) return
    const speed = item.pace ? 1000 / item.pace : kmh ? kmh / 3.6 : null
    if (by === 'km') onChange({ ...item, by, value: speed ? Math.max(100, Math.round((item.value * speed) / 100) * 100) : 1000 })
    else onChange({ ...item, by, value: speed ? Math.max(15, Math.round(item.value / speed / 15) * 15) : 300 })
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white/[0.035] py-2 pl-3.5 pr-1.5" style={{ boxShadow: `inset 3px 0 0 ${accent}` }}>
      <select
        aria-label="Step type"
        value={item.kind}
        onChange={(event) => onChange({ ...item, kind: event.target.value as StepKind })}
        className="cursor-pointer rounded-md bg-transparent py-1 text-sm font-semibold text-[#E8EAF0] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
      >
        {(Object.keys(KIND_LABEL) as StepKind[]).map((kind) => (
          <option key={kind} value={kind} className="bg-[#12161E]">
            {KIND_LABEL[kind]}
          </option>
        ))}
      </select>
      <Toggle
        small
        label="Measure"
        value={item.by}
        options={[
          { id: 'time', label: 'Time' },
          { id: 'km', label: 'Dist' },
        ]}
        onChange={switchTo}
      />
      {item.by === 'time' ? (
        <Field
          key="time"
          label="Duration, minutes:seconds"
          value={item.value}
          format={formatClock}
          parse={(text) => {
            const seconds = parseClock(text)
            return seconds && seconds >= 10 ? Math.min(6 * 3600, seconds) : null
          }}
          onCommit={(value) => value != null && onChange({ ...item, value })}
          className="rounded-lg bg-white/[0.04] px-2 py-1"
          inputClass="w-14 text-sm font-semibold"
          inputMode="text"
        />
      ) : (
        <Field
          key="km"
          label="Distance in metres"
          value={item.value}
          format={(value) => String(Math.round(value))}
          parse={(text) => {
            const meters = Number(text)
            return Number.isFinite(meters) && meters >= 50 ? Math.min(100_000, Math.round(meters)) : null
          }}
          onCommit={(value) => value != null && onChange({ ...item, value })}
          suffix="m"
          className="rounded-lg bg-white/[0.04] px-2 py-1"
          inputClass="w-12 text-right text-sm font-semibold"
          inputMode="numeric"
        />
      )}
      <Field
        optional
        label="Pace target, minutes:seconds per km"
        value={item.pace}
        format={formatPace}
        parse={(text) => {
          const seconds = parseClock(text.includes(':') ? text : `${text}:00`)
          return seconds && seconds >= 120 && seconds <= 900 ? seconds : null
        }}
        onCommit={(pace) => onChange({ ...item, pace })}
        placeholder={item.kind === 'active' ? 'pace' : (zoneHint ?? 'pace')}
        suffix="/km"
        className="rounded-lg bg-white/[0.04] px-2 py-1"
        inputClass="w-10 text-right text-sm"
        inputMode="text"
      />
      <span className="ml-auto flex items-center">
        {order}
        <IconButton label="Remove step" onClick={onRemove}>
          <CloseIcon />
        </IconButton>
      </span>
    </div>
  )
}

/** Shape of the workout: width is time, height is effort. */
export function WorkoutStrip({ blocks, tag, kmh, small = false, className = '' }: { blocks: Block[]; tag: SessionTag; kmh: number | null; small?: boolean; className?: string }) {
  const parts: { seconds: number; kind: StepKind }[] = []
  const expand = (block: Block) => {
    for (let round = 0; round < block.repeat; round += 1) {
      for (const item of block.steps) {
        if (isBlock(item)) expand(item)
        else {
          const speed = item.pace ? 1000 / item.pace : (kmh ?? 10) / 3.6
          parts.push({ seconds: item.by === 'time' ? item.value : item.value / speed, kind: item.kind })
        }
      }
    }
  }
  for (const block of blocks) expand(block)
  if (parts.length === 0) return null
  const activeHeight = isHard(tag) ? '100%' : '62%'
  return (
    <div aria-hidden className={`flex items-end gap-[2px] ${small ? 'h-6' : 'h-12'} ${className}`}>
      {parts.map((part, index) => (
        <span
          key={index}
          className="min-w-[2px] rounded-[3px]"
          style={{
            flexGrow: part.seconds,
            flexBasis: 0,
            height: part.kind === 'active' ? activeHeight : part.kind === 'warmup' ? '40%' : '26%',
            background: kindColor(part.kind, tag),
          }}
        />
      ))}
    </div>
  )
}

function kindColor(kind: StepKind, tag: SessionTag): string {
  return kind === 'active' ? TAG_COLOR[tag] : KIND_COLOR[kind]
}

export function TagPicker({ value, onChange }: { value: SessionTag; onChange: (tag: SessionTag) => void }) {
  return (
    <div role="radiogroup" aria-label="Session type" className="flex flex-wrap gap-2">
      {SESSION_TAGS.map((item) => {
        const on = value === item.id
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(item.id)}
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={on ? { background: TAG_COLOR[item.id], color: '#0B0D12' } : { boxShadow: 'inset 0 0 0 1px #262C3B', color: '#C5CAD3' }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function SportPicker() {
  const sports: { id: 'run' | 'swim' | 'ride'; label: string }[] = [
    { id: 'run', label: 'Run' },
    { id: 'swim', label: 'Swim' },
    { id: 'ride', label: 'Bike' },
  ]
  return (
    <div role="radiogroup" aria-label="Sport" className="flex gap-2">
      {sports.map((sport) => {
        const on = sport.id === 'run'
        return (
          <button
            key={sport.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!on}
            title={on ? undefined : 'Coming soon'}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${on ? 'bg-[#1C2231] text-[#E8EAF0] ring-1 ring-inset ring-[#3A4150]' : 'cursor-not-allowed text-[#5A6275]'}`}
          >
            <SportIcon sport={sport.id} className="h-4 w-4" />
            {sport.label}
            {on ? null : <span className="text-[10px] font-medium uppercase tracking-wider">soon</span>}
          </button>
        )
      })}
    </div>
  )
}

function Field({
  label,
  value,
  format,
  parse,
  onCommit,
  optional = false,
  placeholder,
  suffix,
  className = '',
  inputClass = '',
  inputMode = 'decimal',
}: {
  label: string
  value: number | null
  format: (value: number) => string
  parse: (text: string) => number | null
  onCommit: (value: number | null) => void
  optional?: boolean
  placeholder?: string
  suffix?: string
  className?: string
  inputClass?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
}) {
  const shown = value == null ? '' : format(value)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const commit = () => {
    if (text.trim() === '') {
      if (optional) onCommit(null)
      else setText(shown)
      return
    }
    const parsed = parse(text.trim())
    if (parsed == null) {
      setText(shown)
      return
    }
    setText(format(parsed))
    onCommit(parsed)
  }
  return (
    <label className={`flex items-baseline gap-1 ${className}`}>
      <input
        aria-label={label}
        value={text}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className={`min-w-0 rounded-md bg-transparent tabular-nums text-[#E8EAF0] outline-none placeholder:text-[#5A6275] focus-visible:bg-white/[0.04] ${inputClass}`}
      />
      {suffix ? <span className="shrink-0 text-xs text-[#9AA3B5]">{suffix}</span> : null}
    </label>
  )
}

function Toggle<T extends string>({ label, value, options, onChange, small = false }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void; small?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full bg-white/[0.05] p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-full ${small ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-1.5 text-xs'} font-semibold ${value === option.id ? 'bg-[#E8EAF0] text-[#0B0D12]' : 'text-[#9AA3B5] hover:text-[#E8EAF0]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** With `fold`, the title is a button that shows or hides the content. */
function Section({ label, action, fold, children }: { label: string; action?: ReactNode; fold?: { open: boolean; onToggle: () => void }; children: ReactNode }) {
  return (
    <section className="mt-7">
      <div className={`flex items-center justify-between ${fold && !fold.open ? '' : 'mb-3'}`}>
        {fold ? (
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">
            <button type="button" aria-expanded={fold.open} onClick={fold.onToggle} className="flex items-center gap-1.5 uppercase tracking-[0.16em] hover:text-[#E8EAF0]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${fold.open ? 'rotate-90' : ''}`}>
                <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
              </svg>
              {label}
            </button>
          </h2>
        ) : (
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9AA3B5]">{label}</h2>
        )}
        {action}
      </div>
      {fold && !fold.open ? null : children}
    </section>
  )
}

function InfoCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1E2330] bg-[#0F1218] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#9AA3B5]">{label}</p>
      <p className="mt-1.5 text-sm">{children}</p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-[#1E2330] bg-[#0F1218] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#9AA3B5]">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs tabular-nums text-[#9AA3B5]">{sub}</p>
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-my-2 py-2 text-sm text-[#9AA3B5] hover:text-white">
      ← Week
    </button>
  )
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-semibold text-[#9AA3B5] hover:text-[#E8EAF0]">
      {children}
    </button>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-dashed border-[#3A4150] px-3.5 py-1.5 text-xs font-semibold text-[#C5CAD3] hover:border-[#9AA3B5] hover:text-[#E8EAF0]">
      + {children}
    </button>
  )
}

function RoundButton({ label, onClick, small = false, children }: { label: string; onClick: () => void; small?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid place-items-center rounded-full border border-[#262C3B] text-[#E8EAF0] hover:bg-[#1C2231] ${small ? 'h-7 w-7 text-sm' : 'h-11 w-11 text-lg'}`}
    >
      {children}
    </button>
  )
}

function IconButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-full text-[#9AA3B5] hover:bg-white/5 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent">
      {children}
    </button>
  )
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" />
    </svg>
  )
}
