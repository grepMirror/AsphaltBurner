import { loadScript } from './auth'
import { GOOGLE } from './config'

const API_SCRIPT = 'https://apis.google.com/js/api.js'

export type PickedItem = { id: string; name: string }

type DocsView = {
  setMimeTypes: (mimeTypes: string) => DocsView
  setSelectFolderEnabled: (enabled: boolean) => DocsView
  setIncludeFolders: (enabled: boolean) => DocsView
}
type PickerBuilder = {
  addView: (view: DocsView) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  setAppId: (appId: string) => PickerBuilder
  setTitle: (title: string) => PickerBuilder
  setCallback: (callback: (data: { action: string; docs?: PickedItem[] }) => void) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}
type PickerApi = {
  ViewId: { DOCS: string; FOLDERS: string }
  Action: { PICKED: string; CANCEL: string }
  DocsView: new (view: string) => DocsView
  PickerBuilder: new () => PickerBuilder
}
type GoogleWindow = {
  gapi?: { load: (library: string, options: { callback: () => void; onerror?: () => void }) => void }
  google?: { picker?: PickerApi }
}

let picker: Promise<PickerApi> | null = null

async function pickerApi(): Promise<PickerApi> {
  if (!picker) {
    picker = (async () => {
      await loadScript(API_SCRIPT)
      const win = window as unknown as GoogleWindow
      const gapi = win.gapi
      if (!gapi) throw new Error('Google Picker did not load.')
      await new Promise<void>((resolve, reject) => gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Google Picker did not load.')) }))
      const api = win.google?.picker
      if (!api) throw new Error('Google Picker did not load.')
      return api
    })().catch((error: unknown) => {
      picker = null
      throw error
    })
  }
  return picker
}

/**
 * Google's own file or folder chooser. Only what the user picks becomes visible to the app.
 * Resolves with `null` when the user closes the chooser.
 */
export async function pickDrive(token: string, options: { mode: 'file' | 'folder'; mimeType?: string; title: string }): Promise<PickedItem | null> {
  const api = await pickerApi()
  return new Promise((resolve) => {
    const view = new api.DocsView(options.mode === 'folder' ? api.ViewId.FOLDERS : api.ViewId.DOCS)
    if (options.mode === 'folder') view.setSelectFolderEnabled(true).setIncludeFolders(true)
    else if (options.mimeType) view.setMimeTypes(options.mimeType)
    new api.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE.apiKey)
      .setAppId(GOOGLE.appId)
      .setTitle(options.title)
      .setCallback((data) => {
        if (data.action === api.Action.PICKED) resolve(data.docs?.[0] ?? null)
        else if (data.action === api.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
}
