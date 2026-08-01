<script setup lang="ts">
/**
 * In-app material viewer. Keeps teachers/students on-screen instead of
 * triggering a browser download (especially for .docx).
 * Text and images are selectable/copyable for discussion.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { CourseMaterial } from '../stores/courses'
import {
  docxBlobToHtml,
  htmlToPlainText,
  previewKind,
  type PreviewKind,
} from '../utils/materialPreview'

const props = defineProps<{
  open: boolean
  material: CourseMaterial | null
  blob: Blob | null
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const objectUrl = ref<string | null>(null)
const htmlBody = ref('')
const textBody = ref('')
const converting = ref(false)
const convertError = ref<string | null>(null)
const copyStatus = ref<string | null>(null)
const contentEl = ref<HTMLElement | null>(null)

const kind = computed<PreviewKind>(() => {
  if (!props.material) return 'unsupported'
  return previewKind(props.material.mimeType, props.material.originalName || props.material.title)
})

const title = computed(() => props.material?.title || 'Material')

const canCopyText = computed(
  () => kind.value === 'text' || kind.value === 'docx' || kind.value === 'pdf',
)
const canCopyImage = computed(() => kind.value === 'image' || kind.value === 'docx')

function revokeUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
}

function flashStatus(message: string) {
  copyStatus.value = message
  window.setTimeout(() => {
    if (copyStatus.value === message) copyStatus.value = null
  }, 2200)
}

async function preparePreview() {
  revokeUrl()
  htmlBody.value = ''
  textBody.value = ''
  convertError.value = null
  converting.value = false
  copyStatus.value = null

  if (!props.open || !props.blob || !props.material) return

  const mime = props.material.mimeType || props.blob.type || 'application/octet-stream'
  const typed =
    props.blob.type && props.blob.type !== 'application/octet-stream'
      ? props.blob
      : new Blob([props.blob], { type: mime })

  if (kind.value === 'pdf' || kind.value === 'image') {
    objectUrl.value = URL.createObjectURL(typed)
    return
  }

  if (kind.value === 'text') {
    textBody.value = await typed.text()
    return
  }

  if (kind.value === 'docx') {
    converting.value = true
    try {
      htmlBody.value = await docxBlobToHtml(typed)
    } catch {
      convertError.value =
        'Could not render this Word file. Run npm install in the project folder, restart the app, or ask admin to upload a PDF.'
    } finally {
      converting.value = false
    }
  }
}

watch(
  () => [props.open, props.blob, props.material?.id] as const,
  () => {
    void preparePreview()
  },
  { immediate: true },
)

onBeforeUnmount(revokeUrl)

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)

function selectedPlainText(): string {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return ''
  const text = selection.toString().trim()
  if (!text || !contentEl.value) return text
  // Only use selection when it sits inside the preview body.
  const anchor = selection.anchorNode
  if (anchor && contentEl.value.contains(anchor)) return text
  return ''
}

async function copyText() {
  try {
    let text = selectedPlainText()
    if (!text) {
      if (kind.value === 'text') text = textBody.value
      else if (kind.value === 'docx') text = htmlToPlainText(htmlBody.value)
      else if (kind.value === 'pdf') {
        flashStatus('Select text in the PDF, then click Copy text (or Ctrl+C).')
        return
      }
    }
    if (!text.trim()) {
      flashStatus('No text to copy.')
      return
    }
    await navigator.clipboard.writeText(text)
    flashStatus(selectedPlainText() ? 'Selected text copied.' : 'Text copied.')
  } catch {
    flashStatus('Could not copy text. Try selecting it and pressing Ctrl+C.')
  }
}

async function blobToClipboardPng(blob: Blob): Promise<void> {
  // Clipboard image write prefers PNG in Chromium.
  if (blob.type === 'image/png' || blob.type === 'image/gif') {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return
  }
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0)
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
  })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

async function copyImageFromSrc(src: string) {
  const res = await fetch(src)
  const blob = await res.blob()
  await blobToClipboardPng(blob)
}

async function copyImage() {
  try {
    if (kind.value === 'image' && objectUrl.value) {
      await copyImageFromSrc(objectUrl.value)
      flashStatus('Image copied.')
      return
    }

    if (kind.value === 'docx' && contentEl.value) {
      await nextTick()
      const images = [...contentEl.value.querySelectorAll('img')]
      if (!images.length) {
        flashStatus('No images in this material.')
        return
      }
      // Prefer an image the user right-clicked/focused; else first image.
      const active = images.find((img) => img.matches(':focus, :hover')) || images[0]
      if (!active?.src) {
        flashStatus('No images in this material.')
        return
      }
      await copyImageFromSrc(active.src)
      flashStatus(images.length > 1 ? 'Image copied (first/hovered).' : 'Image copied.')
      return
    }

    flashStatus('No image to copy.')
  } catch {
    flashStatus('Could not copy image. Right-click the image → Copy image.')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="preview-root" role="dialog" aria-modal="true" :aria-label="title">
      <button type="button" class="backdrop" aria-label="Close preview" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <div class="head-text">
            <p class="eyebrow">On-screen view</p>
            <h2>{{ title }}</h2>
          </div>
          <div class="head-actions">
            <button
              v-if="canCopyText"
              type="button"
              class="action"
              @click="copyText"
            >
              Copy text
            </button>
            <button
              v-if="canCopyImage"
              type="button"
              class="action"
              @click="copyImage"
            >
              Copy image
            </button>
            <button type="button" class="close" @click="emit('close')">Close</button>
          </div>
        </header>

        <p v-if="copyStatus" class="copy-status" role="status">{{ copyStatus }}</p>
        <p v-else class="copy-hint">
          Select text to copy, or use the buttons. Images can be copied with
          <strong>Copy image</strong> or right‑click → Copy image.
        </p>

        <div ref="contentEl" class="body selectable">
          <p v-if="loading || converting" class="state">Opening material…</p>
          <p v-else-if="error" class="state error">{{ error }}</p>
          <p v-else-if="convertError" class="state error">{{ convertError }}</p>

          <iframe
            v-else-if="kind === 'pdf' && objectUrl"
            class="frame"
            :src="objectUrl"
            title="PDF preview"
          />
          <img
            v-else-if="kind === 'image' && objectUrl"
            class="image"
            :src="objectUrl"
            :alt="title"
            draggable="true"
          />
          <pre v-else-if="kind === 'text'" class="text">{{ textBody }}</pre>
          <div v-else-if="kind === 'docx' && htmlBody" class="docx" v-html="htmlBody" />
          <p v-else-if="kind === 'unsupported'" class="state">
            This file type can’t be previewed in the browser. Viewing never downloads the file —
            ask admin to upload a PDF if you need it on screen for discussion.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.preview-root {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
}

.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: color-mix(in srgb, #000 55%, transparent);
  cursor: pointer;
}

.panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  height: min(86dvh, 900px);
  border-radius: var(--lh-radius-panel);
  background: var(--lh-panel, #1c2228);
  color: var(--lh-ink);
  box-shadow: 0 24px 64px color-mix(in srgb, #000 45%, transparent);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--lh-ink) 10%, transparent);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lh-accent);
}

.head h2 {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.25;
}

.action,
.close {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: color-mix(in srgb, var(--lh-ink) 8%, transparent);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.action {
  background: color-mix(in srgb, var(--lh-accent) 18%, transparent);
  color: var(--lh-accent);
}

.copy-hint,
.copy-status {
  margin: 0;
  padding: 8px 16px;
  font-size: 12px;
  line-height: 1.4;
  border-bottom: 1px solid color-mix(in srgb, var(--lh-ink) 8%, transparent);
}

.copy-hint {
  color: var(--lh-muted);
}

.copy-status {
  color: var(--lh-accent);
  background: color-mix(in srgb, var(--lh-accent) 10%, transparent);
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: color-mix(in srgb, var(--lh-ink) 3%, transparent);
}

/* Allow selecting / copying text and images for discussion. */
.selectable,
.selectable :deep(*) {
  -webkit-user-select: text;
  user-select: text;
}

.selectable :deep(img),
.image {
  -webkit-user-select: all;
  user-select: all;
  -webkit-user-drag: auto;
  user-drag: auto;
  cursor: grab;
}

.state {
  margin: 0;
  padding: 28px 20px;
  color: var(--lh-muted);
  font-size: 13.5px;
  line-height: 1.45;
}

.state.error {
  color: var(--lh-danger);
}

.frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #111;
}

.image {
  display: block;
  max-width: 100%;
  margin: 0 auto;
  padding: 16px;
}

.text {
  margin: 0;
  padding: 18px 20px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
}

.docx {
  padding: 22px 28px 36px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--lh-ink);
}

.docx :deep(p) {
  margin: 0 0 0.85em;
}

.docx :deep(h1),
.docx :deep(h2),
.docx :deep(h3) {
  margin: 1.1em 0 0.45em;
  line-height: 1.25;
}

.docx :deep(ul),
.docx :deep(ol) {
  margin: 0 0 0.85em;
  padding-left: 1.4em;
}

.docx :deep(img) {
  max-width: 100%;
  height: auto;
  margin: 0.6em 0;
}

.docx :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1em;
}

.docx :deep(td),
.docx :deep(th) {
  border: 1px solid color-mix(in srgb, var(--lh-ink) 18%, transparent);
  padding: 6px 8px;
}

@media (max-width: 640px) {
  .head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
