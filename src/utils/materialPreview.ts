/** Helpers for in-app material viewing (no browser download). */

export type PreviewKind = 'pdf' | 'image' | 'text' | 'docx' | 'unsupported'

type MammothModule = {
  convertToHtml: (
    input: { arrayBuffer: ArrayBuffer },
    options?: {
      convertImage?: {
        // mammoth image converter factory
        (element: {
          read: (encoding: string) => Promise<string>
          contentType: string
        }) => Promise<{ src: string }>
      }
    },
  ) => Promise<{ value: string }>
  images?: {
    imgElement: (fn: (element: {
      read: (encoding: string) => Promise<string>
      contentType: string
    }) => Promise<{ src: string }>) => {
      (element: {
        read: (encoding: string) => Promise<string>
        contentType: string
      }): Promise<{ src: string }>
    }
  }
  default?: MammothModule
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
  const localId = 'mammoth'
  try {
    return (await import(/* @vite-ignore */ localId)) as MammothModule
  } catch {
    const cdnId = 'https://esm.sh/mammoth@1.9.0'
    return (await import(/* @vite-ignore */ cdnId)) as MammothModule
  }
}

/** Convert a .docx blob to HTML (text + inline images) for on-screen reading. */
export async function docxBlobToHtml(blob: Blob): Promise<string> {
  const mammothMod = await loadMammoth()
  const mammoth = mammothMod.default?.convertToHtml ? mammothMod.default : mammothMod
  const convert = mammoth.convertToHtml
  if (!convert) {
    throw new Error('Word preview library is unavailable. Run npm install, then restart the app.')
  }

  const buffer = await blob.arrayBuffer()
  const imagesApi = mammoth.images ?? mammothMod.images
  const options = imagesApi?.imgElement
    ? {
        convertImage: imagesApi.imgElement(async (image) => {
          const base64 = await image.read('base64')
          return { src: `data:${image.contentType};base64,${base64}` }
        }),
      }
    : undefined

  const result = await convert({ arrayBuffer: buffer }, options)
  return result.value || '<p><em>No readable text in this document.</em></p>'
}

/** Plain text from HTML (for Copy text). */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}
