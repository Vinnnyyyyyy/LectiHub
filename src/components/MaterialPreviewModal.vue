<script setup lang="ts">
/**
 * In-app material viewer. Keeps teachers/students on-screen instead of
 * triggering a browser download (especially for .docx).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CourseMaterial } from '../stores/courses'
import { docxBlobToHtml, previewKind, type PreviewKind } from '../utils/materialPreview'

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

const kind = computed<PreviewKind>(() => {
  if (!props.material) return 'unsupported'
  return previewKind(props.material.mimeType, props.material.originalName || props.material.title)
})

const title = computed(() => props.material?.title || 'Material')

function revokeUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
}

async function preparePreview() {
  revokeUrl()
  htmlBody.value = ''
  textBody.value = ''
  convertError.value = null
  converting.value = false

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
          <button type="button" class="close" @click="emit('close')">Close</button>
        </header>

        <div class="body">
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

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: color-mix(in srgb, var(--lh-ink) 3%, transparent);
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
</style>
