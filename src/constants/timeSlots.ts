function buildHalfHourSlots(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): string[] {
  const slots: string[] = []
  let minutes = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  while (minutes + 30 <= end) {
    const next = minutes + 30
    const format = (value: number) => {
      const h = String(Math.floor(value / 60)).padStart(2, '0')
      const m = String(value % 60).padStart(2, '0')
      return `${h}:${m}`
    }
    slots.push(`${format(minutes)}-${format(next)}`)
    minutes = next
  }
  return slots
}

/** 30-minute reservation slots (lunch gap 12:00–13:00). */
export const TIME_SLOTS = [
  ...buildHalfHourSlots(9, 0, 12, 0),
  ...buildHalfHourSlots(13, 0, 18, 0),
] as const

export type TimeSlot = (typeof TIME_SLOTS)[number]

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
