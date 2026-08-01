/** Parse "HH:MM" or "HH:MM:SS" into minutes from midnight. */
function parseHm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

function formatHm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Build bookable slot labels for a half-open window [start, end).
 * Used as a local fallback when the API has not returned timeSlots yet.
 */
export function buildTimeSlots(
  startHm: string,
  endHm: string,
  slotMinutes: number,
): string[] {
  const slots: string[] = []
  let minutes = parseHm(startHm)
  const end = parseHm(endHm)
  const step = slotMinutes > 0 ? slotMinutes : 30
  while (minutes + step <= end) {
    const next = minutes + step
    slots.push(`${formatHm(minutes)}-${formatHm(next)}`)
    minutes = next
  }
  return slots
}

/** Default 30-minute reservation slots (lunch gap 12:00–13:00). */
export const TIME_SLOTS = [
  ...buildTimeSlots('09:00', '12:00', 30),
  ...buildTimeSlots('13:00', '18:00', 30),
] as const

export type TimeSlot = (typeof TIME_SLOTS)[number]

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
