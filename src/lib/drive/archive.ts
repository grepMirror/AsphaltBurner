import JSZip from 'jszip'

/** Any `media/` folder of the Strava export, at the root or nested. */
const MEDIA = /(^|\/)media\//i

/**
 * The Strava export zip without its media folder. Every other entry is copied as it is,
 * so the archive still reads through the normal zip import.
 */
export async function withoutMedia(zip: Blob): Promise<Blob> {
  const source = await JSZip.loadAsync(zip)
  const target = new JSZip()
  for (const [name, entry] of Object.entries(source.files)) {
    if (entry.dir || MEDIA.test(name)) continue
    target.file(name, await entry.async('uint8array'), { binary: true, date: entry.date })
  }
  return target.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

