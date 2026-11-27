import { useEffect, useId, useState, type ReactNode } from 'react'
import { NAME_MAX, type HrSettings, type Profile } from '../lib/profiles'
import { ConnectorsPanel } from './Connectors'
import { DRIVE_CONNECTOR_ID } from './DriveCard'
import { HeartRatePanel } from './HeartRatePanel'
import { ImportZip } from './ImportZip'
import { Modal } from './Modal'

type Props = {
  profile: Profile
  /** Bumped when a sync or an erase changed the profile under the screen, so the fields start again from it. */
  revision: number
  /** Scrolls the popup to the Google Drive connector when it opens. */
  focusDrive?: boolean
  onRename: (name: string) => void
  onHr: (patch: Partial<HrSettings>) => void
  onClose: () => void
}

/** Profile popup: the name, the heart rate, the activities import and the connectors. */
export function ProfileModal({ profile, revision, focusDrive = false, onRename, onHr, onClose }: Props) {
  useEffect(() => {
    if (!focusDrive) return
    document.getElementById(DRIVE_CONNECTOR_ID)?.scrollIntoView({ block: 'center' })
  }, [focusDrive])

  return (
    <Modal title="Profile" onClose={onClose} wide>
      <div className="flex flex-col gap-6">
        <NameField key={revision} value={profile.name} onCommit={onRename} />

        <Section title="Heart rate">
          <HeartRatePanel key={revision} values={profile} onChange={onHr} />
        </Section>

        <Section title="Activities">
          <ImportZip />
        </Section>

        <Section title="Connectors">
          <ConnectorsPanel />
        </Section>

        <button type="button" onClick={onClose} className="w-full rounded-2xl bg-[#E8EAF0] py-3 text-sm font-semibold text-[#0B0D12] hover:bg-white">
          Done
        </button>
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
function NameField({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
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
