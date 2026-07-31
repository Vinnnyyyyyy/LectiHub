import { onBeforeUnmount, ref, watchEffect } from 'vue'

/**
 * Lets a routed view override the shell header with live copy — a running
 * count ("3 teachers · 48 students") or a greeting. Route meta supplies the
 * static fallback for both.
 */
const eyebrowOverride = ref<string | null>(null)
const titleOverride = ref<string | null>(null)

function useOverride(target: typeof eyebrowOverride, source: () => string | null) {
  watchEffect(() => {
    target.value = source()
  })
  onBeforeUnmount(() => {
    target.value = null
  })
}

export function usePageEyebrow(source: () => string | null) {
  useOverride(eyebrowOverride, source)
}

export function usePageTitle(source: () => string | null) {
  useOverride(titleOverride, source)
}

export function usePageMeta() {
  return { eyebrowOverride, titleOverride }
}
