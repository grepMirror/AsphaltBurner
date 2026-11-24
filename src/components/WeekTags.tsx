import { useId, useState, type FormEvent } from 'react'
import { KIND_LABEL_MAX, SWATCHES, inkOn, isHex, kindNameTaken, kindsOf, weeksUsing, type BlockBook, type BlockKind } from '../lib/blocks'
import { Modal } from './Modal'

/**
 * Shown above the week list while weeks are being tagged.
 * Chips apply a block type to the selected weeks at once; the pencil opens the block types window.
 */
export function TagPanel({
  kinds,
  count,
  shared,
  untagged,
  onApply,
  onEditTypes,
  onDone,
}: {
  kinds: BlockKind[]
  count: number
  /** Kind that every selected week carries, if they all carry the same one. */
  shared: string | null
  /** Every selected week has no tag. */
  untagged: boolean
  onApply: (kindId: string | null) => void
  onEditTypes: () => void
  onDone: () => void
}) {
  const none = count === 0
  return (
    <section aria-label="Tag weeks" className="rounded-2xl border border-[#2A3140] bg-[#12161E] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#E8EAF0]" aria-live="polite">
          {none ? 'Tag weeks' : `${count} ${count === 1 ? 'week' : 'weeks'} selected`}
        </p>
        <button type="button" onClick={onDone} className="rounded-full bg-[#E8EAF0] px-3.5 py-1.5 text-xs font-semibold text-[#0B0D12] hover:bg-white">
          Done
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#9AA3B5]">{none ? 'Tap weeks to select them, or drag across several. Shift-click selects a range.' : 'Choose a block type for the selected weeks.'}</p>
      <div role="group" aria-label="Block type" className="mt-3 flex flex-wrap gap-1.5">
        {kinds.map((kind) => {
          const on = shared === kind.id
          return (
            <button
              key={kind.id}
              type="button"
              disabled={none}
              aria-pressed={on}
              onClick={() => onApply(kind.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'text-[#0B0D12]' : 'border-[#262C3B] text-[#E8EAF0] enabled:hover:bg-white/5'}`}
              style={on ? { background: kind.color, borderColor: kind.color, color: inkOn(kind.color) } : undefined}
            >
              {on ? null : <span className="h-2 w-2 rounded-full" style={{ background: kind.color }} />}
              {kind.label}
            </button>
          )
        })}
        <button
          type="button"
          disabled={none}
          aria-pressed={!none && untagged}
          onClick={() => onApply(null)}
          className={`rounded-full border border-dashed px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${!none && untagged ? 'border-[#E8EAF0] text-[#E8EAF0]' : 'border-[#3A4150] text-[#9AA3B5] enabled:hover:text-[#E8EAF0]'}`}
        >
          No tag
        </button>
        <button
          type="button"
          aria-label="Edit block types"
          title="Edit block types"
          onClick={onEditTypes}
          className="grid h-7 w-7 place-items-center rounded-full border border-[#262C3B] text-[#9AA3B5] hover:bg-white/5 hover:text-[#E8EAF0]"
        >
          <PencilIcon />
        </button>
      </div>
    </section>
  )
}

/** Choose a block type for the selection, or make your own with a name and a color. */
export function BlockTypesModal({
  book,
  count,
  onChoose,
  onCreate,
  onRemove,
  onClose,
}: {
  book: BlockBook
  /** Weeks that are selected right now. A type can only be applied when there are some. */
  count: number
  onChoose: (kindId: string) => void
  onCreate: (label: string, color: string) => void
  onRemove: (kindId: string) => void
  onClose: () => void
}) {
  const nameId = useId()
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(SWATCHES[5])
  const [asking, setAsking] = useState<string | null>(null)
  const taken = label.trim() !== '' && kindNameTaken(book, label)
  const canApply = count > 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (label.trim() === '' || taken) return
    onCreate(label, color)
    setLabel('')
  }

  return (
    <Modal title="Block types" onClose={onClose}>
      <p className="text-xs leading-relaxed text-[#9AA3B5]">
        {canApply ? `Choose a type for the ${count} selected ${count === 1 ? 'week' : 'weeks'}.` : 'Select weeks in the list to apply a type. You can still make your own here.'}
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {kindsOf(book).map((kind) => {
          const used = kind.custom ? weeksUsing(book, kind.id) : 0
          const confirming = asking === kind.id
          return (
            <li key={kind.id} className="flex items-center gap-1">
              {confirming ? (
                <div role="alert" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#E7A3A3]/40 bg-[#E7A3A3]/10 px-3 py-2">
                  <span className="min-w-0 flex-1 text-xs text-[#E8EAF0]">
                    Delete <span className="font-semibold">{kind.label}</span>?{used > 0 ? ` ${used} ${used === 1 ? 'week loses' : 'weeks lose'} its tag.` : ''}
                  </span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onRemove(kind.id)
                        setAsking(null)
                      }}
                      className="rounded-full bg-[#E7A3A3] px-3 py-1 text-xs font-semibold text-[#0B0D12]"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setAsking(null)} className="rounded-full px-3 py-1 text-xs font-semibold text-[#C5CAD3] hover:bg-white/5">
                      Keep
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!canApply}
                    onClick={() => onChoose(kind.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left enabled:hover:bg-white/5 disabled:cursor-default"
                  >
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: kind.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#E8EAF0]">{kind.label}</span>
                    {kind.custom ? <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-[#5A6275]">Custom</span> : null}
                  </button>
                  {kind.custom ? (
                    <button
                      type="button"
                      aria-label={`Delete ${kind.label}`}
                      title={`Delete ${kind.label}`}
                      onClick={() => setAsking(kind.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#9AA3B5] hover:bg-white/5 hover:text-[#E7A3A3]"
                    >
                      <BinIcon />
                    </button>
                  ) : null}
                </>
              )}
            </li>
          )
        })}
      </ul>

      <form onSubmit={submit} className="mt-4 border-t border-[#1E2330] pt-4">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">New type</h3>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold uppercase" style={{ background: color, color: inkOn(color) }} aria-hidden>
            {(label.trim() || 'Aa').slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor={nameId} className="sr-only">
              Block type name
            </label>
            <input
              id={nameId}
              value={label}
              maxLength={KIND_LABEL_MAX}
              placeholder="Name, e.g. Hills"
              aria-invalid={taken}
              onChange={(event) => setLabel(event.target.value)}
              className={`w-full rounded-xl border bg-[#0F1218] px-3.5 py-2.5 text-sm text-[#E8EAF0] outline-none placeholder:text-[#5A6275] focus:border-[#4A5264] ${taken ? 'border-[#E7A3A3]' : 'border-[#1E2330]'}`}
            />
          </div>
        </div>
        {taken ? <p className="mt-1.5 text-xs text-[#E7A3A3]">A type with this name already exists.</p> : null}
        <div role="radiogroup" aria-label="Color" className="mt-3 flex flex-wrap items-center gap-2">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={color.toLowerCase() === swatch.toLowerCase()}
              aria-label={swatch}
              onClick={() => setColor(swatch)}
              className="grid h-7 w-7 place-items-center rounded-full ring-offset-2 ring-offset-[#10131A] transition-shadow aria-checked:ring-2 aria-checked:ring-[#E8EAF0]"
              style={{ background: swatch }}
            />
          ))}
          <label className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-[#4A5264] text-[#9AA3B5] hover:text-[#E8EAF0]" title="Pick any color">
            <span aria-hidden className="text-sm leading-none">
              +
            </span>
            <span className="sr-only">Pick any color</span>
            <input
              type="color"
              value={isHex(color) ? color.toLowerCase() : SWATCHES[0]}
              onChange={(event) => setColor(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={label.trim() === '' || taken} className="rounded-full bg-[#E8EAF0] px-5 py-2.5 text-sm font-semibold text-[#0B0D12] enabled:hover:bg-white disabled:opacity-40">
            {canApply ? `Create and apply` : 'Create type'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.8 13.2 3.4 10 10.8 2.6a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2L6 12.6l-3.2.6Z" />
      <path d="m9.6 3.8 2.6 2.6" />
    </svg>
  )
}

function BinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 4.5h9M6.2 4.4V3.2h3.6v1.2M4.4 4.5l.5 8.2h6.2l.5-8.2" />
    </svg>
  )
}
