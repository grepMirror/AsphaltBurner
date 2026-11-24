import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { NAME_MAX, activeProfile, type HrSettings, type Profile, type ProfileBook } from '../lib/profiles'
import { ConnectorsPanel } from './Connectors'
import { HeartRatePanel } from './HeartRatePanel'
import { Modal } from './Modal'

type Props = {
  book: ProfileBook
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onHr: (id: string, patch: Partial<HrSettings>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

/**
 * Profile popup: switch or create a profile, rename it, and set its heart rate and connectors.
 * Switching changes those two only. Activities are shared by every profile.
 */
export function ProfileModal({ book, onSelect, onCreate, onRename, onHr, onDelete, onClose }: Props) {
  const profile = activeProfile(book)
  const [listOpen, setListOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [focusName, setFocusName] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // A new profile starts with a generic name: put the cursor in the name field so it can be replaced at once.
  useEffect(() => {
    if (!focusName) return
    nameRef.current?.focus()
    nameRef.current?.select()
    setFocusName(false)
  }, [focusName, profile.id])

  return (
    <Modal title="Profile" onClose={onClose} wide>
      <div className="flex flex-col gap-6">
        <div>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={listOpen}
            onClick={() => setListOpen((value) => !value)}
            className={`flex w-full items-center gap-3 rounded-xl border bg-[#12161E] px-3 py-2.5 text-left hover:border-[#3A4150] ${listOpen ? 'border-[#4A5264]' : 'border-[#262C3B]'}`}
          >
            <Avatar profile={profile} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">Profile</span>
              <span className="block truncate text-sm font-semibold text-[#E8EAF0]">{profile.name}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-[#9AA3B5] transition-transform ${listOpen ? 'rotate-180' : ''}`} aria-hidden="true">
              <path d="m3 5.2 4 4 4-4" />
            </svg>
          </button>
          {listOpen ? (
            <div className="mt-1.5 rounded-xl border border-[#1E2330] bg-[#0F1218] p-1">
              <ul role="listbox" aria-label="Profiles">
                {book.profiles.map((item) => {
                  const on = item.id === profile.id
                  return (
                    <li key={item.id} role="option" aria-selected={on}>
                      <button
                        type="button"
                        onClick={() => {
                          setAsking(false)
                          onSelect(item.id)
                          setListOpen(false)
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/5 ${on ? 'bg-white/[0.04]' : ''}`}
                      >
                        <Avatar profile={item} small />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#E8EAF0]">{item.name}</span>
                        {on ? (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#9DDBC0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m2.8 7.4 2.6 2.6 5.8-6" />
                          </svg>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setAsking(false)
                  onCreate()
                  setListOpen(false)
                  setFocusName(true)
                }}
                className="mt-1 flex w-full items-center gap-3 rounded-lg border-t border-[#1E2330] px-2.5 py-2.5 text-left text-sm font-semibold text-[#E8EAF0] hover:bg-white/5"
              >
                <span className="grid h-7 w-7 place-items-center text-lg leading-none">+</span>
                New profile
              </button>
            </div>
          ) : null}
        </div>

        <NameField key={profile.id} inputRef={nameRef} value={profile.name} onCommit={(name) => onRename(profile.id, name)} />

        <Section title="Heart rate">
          <HeartRatePanel key={profile.id} values={profile} onChange={(patch) => onHr(profile.id, patch)} />
        </Section>

        <Section title="Connectors">
          <ConnectorsPanel key={profile.id} />
        </Section>

        <p className="-mt-2 text-xs leading-relaxed text-[#5A6275]">Activities are shared: every profile sees the same sessions. Only the heart rate and the connectors change with the profile.</p>

        {book.profiles.length > 1 ? (
          <div className="border-t border-[#1E2330] pt-4">
            {asking ? (
              <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#E7A3A3]/40 bg-[#E7A3A3]/10 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-xs text-[#E8EAF0]">
                  Delete <span className="font-semibold">{profile.name}</span>? Its heart-rate settings and connectors login are removed. Activities stay.
                </span>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAsking(false)
                      onDelete(profile.id)
                    }}
                    className="rounded-full bg-[#E7A3A3] px-3.5 py-1.5 text-xs font-semibold text-[#0B0D12]"
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setAsking(false)} className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#C5CAD3] hover:bg-white/5">
                    Keep
                  </button>
                </span>
              </div>
            ) : (
              <button type="button" onClick={() => setAsking(true)} className="text-xs font-semibold text-[#9AA3B5] hover:text-[#E7A3A3]">
                Delete this profile
              </button>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">{title}</h3>
      {children}
    </section>
  )
}

/** Name of the profile. Saved when the field loses focus or on Enter; an empty name goes back to the old one. */
function NameField({ value, inputRef, onCommit }: { value: string; inputRef: RefObject<HTMLInputElement>; onCommit: (name: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (draft.trim() === '') {
      setDraft(value)
      return
    }
    onCommit(draft)
    setDraft(draft.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX))
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-[#9AA3B5]">
        Name
      </label>
      <input
        id={id}
        ref={inputRef}
        value={draft}
        maxLength={NAME_MAX}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="w-full rounded-xl border border-[#1E2330] bg-[#0F1218] px-3.5 py-2.5 text-sm text-[#E8EAF0] outline-none focus:border-[#4A5264]"
      />
    </div>
  )
}

/** Round badge with the first letter of the name. */
function Avatar({ profile, small = false }: { profile: Profile; small?: boolean }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-white/10 font-semibold uppercase text-[#E8EAF0] ${small ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'}`}>
      {profile.name.slice(0, 1)}
    </span>
  )
}
