import { useDrive, type PromptChoice, type PromptView } from '../lib/drive/DriveProvider'
import { Modal } from './Modal'

type Option = { choice: PromptChoice; title: string; text: string; primary?: boolean }

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}

/** What each choice does, written for the question that is open. */
function describe(prompt: PromptView): { title: string; intro: string; options: Option[] } {
  if (prompt.kind === 'loaded') {
    const where = prompt.folderName ? ` from "${prompt.folderName}"` : ' from Drive'
    return prompt.archive
      ? {
          title: 'Profile loaded with its archive',
          intro: `"${prompt.profileName}" was loaded${where} together with its Strava archive.`,
          options: [{ choice: 'cancel', primary: true, title: 'OK', text: '' }],
        }
      : {
          title: 'Profile loaded without an archive',
          intro: `"${prompt.profileName}" was loaded${where}, but no archive was found next to it, so no activities came with it. To add them, import your Strava zip on this device (Profile, Activities, Import zip), then come back to the Google Drive card and click Back up archive.`,
          options: [{ choice: 'cancel', primary: true, title: 'OK', text: '' }],
        }
  }
  if (prompt.kind === 'other') {
    return {
      title: 'Another profile is in this folder',
      intro: `"${prompt.folderName}" holds the profile "${prompt.remoteName}", not "${prompt.localName}". Do you want to load it?`,
      options: [
        {
          choice: 'replace',
          primary: true,
          title: `Load "${prompt.remoteName}"`,
          text: prompt.archive
            ? `Replaces everything on this device with "${prompt.remoteName}" and its Strava archive: sessions, plans, week blocks, heart-rate settings and activities. This cannot be undone.`
            : `Replaces the sessions, plans, week blocks and heart-rate settings of this device with those of "${prompt.remoteName}". The folder has no archive, so the activities on this device are kept. This cannot be undone.`,
        },
        { choice: 'cancel', title: 'Cancel', text: 'Nothing is linked and nothing changes.' },
      ],
    }
  }
  if (prompt.kind === 'missing') {
    return {
      title: 'This folder has no profile yet',
      intro: `"${prompt.folderName}" holds no profile file, so "${prompt.localName}" is not in Drive yet. What do you want to do?`,
      options: [
        {
          choice: 'sync',
          primary: true,
          title: `Sync "${prompt.localName}" to Drive`,
          text: 'Saves this profile in the folder, with its archive if this device has one. Nothing else in the folder is changed.',
        },
        {
          choice: 'new',
          title: 'Start over with an empty profile',
          text: `Erases everything on this device: "${prompt.localName}" with its sessions, plans, week blocks and heart-rate settings, the activities, the Strava zip and the Garmin connection. An empty profile is then saved in the folder, ready for you to create plans or import a zip. This cannot be undone.`,
        },
        { choice: 'cancel', title: 'Cancel', text: 'Nothing changes.' },
      ],
    }
  }
  if (prompt.kind === 'archive') {
    return {
      title: 'Restore the archive',
      intro: `The Strava archive in "${prompt.folderName}" will be loaded on this device, which already has activities.`,
      options: [
        {
          choice: 'merge',
          primary: true,
          title: 'Merge',
          text: 'Adds the activities of the archive that this device does not have yet. An activity that is already here, with the same date and name, is left untouched.',
        },
        {
          choice: 'replace',
          title: 'Replace',
          text: 'Deletes the activities on this device and reloads the whole archive from Drive. Garmin activities on days the archive does not cover are kept.',
        },
        { choice: 'cancel', title: 'Cancel', text: 'Nothing changes.' },
      ],
    }
  }
  return {
    title: 'This folder already has your profile',
    intro: `"${prompt.folderName}" holds a profile file for this profile, and this device has planner data too. This device: ${count(prompt.local.sessions, 'session')}, ${count(prompt.local.plans, 'plan')}. In Drive: ${count(prompt.remote.sessions, 'session')}, ${count(prompt.remote.plans, 'plan')}.`,
    options: [
      {
        choice: 'merge',
        primary: true,
        title: 'Merge',
        text: 'Keeps the sessions, plans and week blocks of both. When the same item is in both, the copy edited most recently wins. The merged result is saved to the file in Drive.',
      },
      {
        choice: 'replace',
        title: "Replace this device's data",
        text: "Deletes this device's sessions, plans and week blocks and loads those of the Drive file instead. Heart-rate settings come from the file too. This cannot be undone.",
      },
      { choice: 'cancel', title: 'Cancel', text: 'Nothing is linked and nothing changes.' },
    ],
  }
}

/** Window asking what to do when Drive and this device both have data. Closing it counts as cancel. */
export function DrivePrompt() {
  const drive = useDrive()
  if (!drive.prompt) return null
  const { title, intro, options } = describe(drive.prompt)

  return (
    <Modal title={title} onClose={() => void drive.answer('cancel')}>
      <p className="mb-4 text-sm leading-relaxed text-[#C5CAD3]">{intro}</p>
      <div className="flex flex-col gap-2.5">
        {options.map((option) => (
          <button
            key={option.choice}
            type="button"
            onClick={() => void drive.answer(option.choice)}
            className={`rounded-xl border px-4 py-3 text-left hover:border-[#4A5264] ${option.primary ? 'border-sky-300/40 bg-sky-400/10' : 'border-[#262C3B] bg-[#12161E]'}`}
          >
            <span className="block text-sm font-semibold text-[#E8EAF0]">{option.title}</span>
            {option.text ? <span className="mt-1 block text-xs leading-relaxed text-[#9AA3B5]">{option.text}</span> : null}
          </button>
        ))}
      </div>
    </Modal>
  )
}
