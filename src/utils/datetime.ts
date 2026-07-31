/** Shared date/time formatting for the workspace screens. */

/** Parses the API's date-time shape ("2026-07-25 10:00:00" or ISO). */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Mon, Jul 27, 2026" from a plain "2026-07-27". */
export function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "Jul 27, 2:12 PM" from an API timestamp. */
export function formatDateTime(value: string) {
  const date = parseApiDate(value)
  if (!date) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "12 min ago", "2 days ago". */
export function relativeTime(value: string | null | undefined) {
  const date = parseApiDate(value)
  if (!date) return ''
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

/** Whole hours elapsed since an API timestamp; Infinity when unparseable. */
export function hoursSince(value: string | null | undefined) {
  const date = parseApiDate(value)
  if (!date) return Number.POSITIVE_INFINITY
  return (Date.now() - date.getTime()) / 36e5
}

/** "09:00-09:30" → "09:00 – 09:30". */
export function formatSlot(slot: string) {
  return slot.replace('-', ' – ')
}

/** Start–end across a set of contiguous preferred slots. */
export function formatSlotWindow(slots: { timeSlot: string }[]) {
  if (!slots.length) return ''
  const sorted = [...slots].sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
  const start = sorted[0]!.timeSlot.split('-')[0]
  const end = sorted[sorted.length - 1]!.timeSlot.split('-')[1]
  return `${start} – ${end}`
}
