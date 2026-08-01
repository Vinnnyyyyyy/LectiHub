/** Helpers for in-app material viewing (no browser download). */

export type PreviewKind = 'pdf' | 'image' | 'text' | 'docx' | 'unsupported'

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

/** Convert a .docx blob to HTML for on-screen reading (no download). */
export async function docxBlobToHtml(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth')
  const buffer = await blob.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  return result.value || '<p><em>No readable text in this document.</em></p>'
}
