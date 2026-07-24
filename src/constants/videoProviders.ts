export type VideoProvider = 'jitsi' | 'google_meet' | 'zoom'

export interface VideoProviderOption {
  value: VideoProvider
  label: string
  hint: string
}

export const VIDEO_PROVIDER_OPTIONS: VideoProviderOption[] = [
  { value: 'jitsi', label: 'Jitsi Meet', hint: 'Opens in the browser, no account needed' },
  { value: 'google_meet', label: 'Google Meet', hint: 'Best with a Google account' },
  { value: 'zoom', label: 'Zoom', hint: 'Best if you use the Zoom app' },
]

export function providerLabel(value?: string | null): string {
  const match = VIDEO_PROVIDER_OPTIONS.find((option) => option.value === value)
  return match ? match.label : 'Let the center decide'
}
