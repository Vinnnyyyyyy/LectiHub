/** Helpers for in-app material viewing (no browser download). */

export type PreviewKind = 'pdf' | 'image' | 'text' | 'docx' | 'unsupported'

type MammothModule = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  default?: {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }
}

const IMAGE_PREFIX = 'image/'
const TEXT_PREFIXES = ['text/', 'application/json', 'application/xml']

export function extensionOf(name: string): string {
  const parts = name.split('.')
  return parts.length > 1 ? (parts.at(-1) || '').toLowerCase() : ''
}

export function previewKind(mimeType: string, fileName: string): PreviewKind {
  const mime = (mimeType || '').toLowerCase()
  const ext = extensionOf(fileName)

  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (mime.startsWith(IMAGE_PREFIX) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return 'image'
  }
  if (
    TEXT_PREFIXES.some((prefix) => mime.startsWith(prefix) || mime === prefix) ||
    ['txt', 'md', 'csv', 'log'].includes(ext)
  ) {
    return 'text'
  }
  if (
    mime.includes('wordprocessingml') ||
    mime === 'application/msword' ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    return 'docx'
  }
  return 'unsupported'
}

async function loadMammoth(): Promise<MammothModule> {
  // Variable + @vite-ignore so Vite does not fail the whole app when
  // node_modules/mammoth is missing (user still needs `npm install`).
  const localId = 'mammoth'
  try {
    return (await import(/* @vite-ignore */ localId)) as MammothModule
  } catch {
    const cdnId = 'https://esm.sh/mammoth@1.9.0'
    return (await import(/* @vite-ignore */ cdnId)) as MammothModule
  }
}

/** Convert a .docx blob to HTML for on-screen reading (no download). */
export async function docxBlobToHtml(blob: Blob): Promise<string> {
  const mammoth = await loadMammoth()
  const convert = mammoth.convertToHtml ?? mammoth.default?.convertToHtml
  if (!convert) {
    throw new Error('Word preview library is unavailable. Run npm install, then restart the app.')
  }
  const buffer = await blob.arrayBuffer()
  const result = await convert({ arrayBuffer: buffer })
  return result.value || '<p><em>No readable text in this document.</em></p>'
}
