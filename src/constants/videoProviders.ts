export type VideoProvider = 'jitsi' | 'google_meet' | 'zoom' | 'digital_samba'

export interface VideoProviderOption {
  value: VideoProvider
  label: string
  hint: string
}

export const VIDEO_PROVIDER_OPTIONS: VideoProviderOption[] = [
  { value: 'jitsi', label: 'Jitsi Meet', hint: 'Opens in the browser, no account needed' },
  { value: 'google_meet', label: 'Google Meet', hint: 'Best with a Google account' },
  { value: 'zoom', label: 'Zoom', hint: 'Best if you use the Zoom app' },
  { value: 'digital_samba', label: 'Digital Samba', hint: 'Centre-hosted classroom rooms' },
]

export function providerLabel(value?: string | null): string {
  const match = VIDEO_PROVIDER_OPTIONS.find((option) => option.value === value)
  return match ? match.label : 'Let the center decide'
}

/** Filter the full catalog down to providers enabled in centre settings. */
export function enabledProviderOptions(enabled?: unknown): VideoProviderOption[] {
  const ids = Array.isArray(enabled)
    ? enabled.map((item) => String(item))
    : VIDEO_PROVIDER_OPTIONS.map((option) => option.value)
  const filtered = VIDEO_PROVIDER_OPTIONS.filter((option) => ids.includes(option.value))
  return filtered.length ? filtered : VIDEO_PROVIDER_OPTIONS
}
