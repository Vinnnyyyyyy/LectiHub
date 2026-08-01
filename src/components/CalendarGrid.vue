<template>
  <div class="cal-grid">
    <div class="cal-toolbar">
      <div class="nav-group">
        <button type="button" class="nav-btn" aria-label="Previous" @click="step(-1)">‹</button>
        <button type="button" class="nav-btn" aria-label="Next" @click="step(1)">›</button>
        <button type="button" class="nav-btn today" @click="goToday">today</button>
      </div>

      <p class="cal-title">{{ headerLabel }}</p>

      <div class="mode-toggle" role="group" aria-label="Calendar view">
        <button type="button" :class="{ active: mode === 'day' }" @click="setMode('day')">
          day
        </button>
        <button type="button" :class="{ active: mode === 'month' }" @click="setMode('month')">
          month
        </button>
        <button type="button" :class="{ active: mode === 'year' }" @click="setMode('year')">
          year
        </button>
      </div>
    </div>

    <div v-if="mode === 'day'" class="day-view">
      <p class="day-hint">Vacant slots are open; gold marks booked time.</p>
      <ul v-if="daySlots.length" class="slot-timeline" aria-label="Day timeline">
        <li
          v-for="slot in daySlots"
          :key="slot.timeSlot"
          class="slot-row"
          :class="slot.status"
        >
          <span class="slot-time">{{ formatSlot(slot.timeSlot) }}</span>
          <span class="slot-status">{{ slotLabel(slot) }}</span>
        </li>
      </ul>
      <p v-else class="day-empty">No centre hours configured for this day.</p>
    </div>

    <div v-else-if="mode === 'month'" class="month-view">
      <div class="weekday-row">
        <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
      </div>
      <div class="day-grid">
        <button
          v-for="cell in monthCells"
          :key="cell.key"
          type="button"
          class="day-cell"
          :class="{
            muted: !cell.inMonth,
            today: cell.isToday,
            selected: cell.iso === selectedDate,
            'has-event': cell.hasEvent,
            'has-highlight': cell.hasHighlight,
            disabled: cell.disabled,
          }"
          :disabled="cell.disabled"
          @click="onSelect(cell)"
        >
          <span class="day-num">{{ cell.day }}</span>
          <span v-if="cell.labels.length" class="day-labels">
            <span v-for="(label, idx) in cell.labels.slice(0, 2)" :key="`${cell.key}-${idx}`">
              {{ label }}
            </span>
          </span>
        </button>
      </div>
    </div>

    <div v-else class="year-view">
      <button
        v-for="month in yearMonths"
        :key="month.key"
        type="button"
        class="mini-month"
        :class="{ active: month.monthIndex === cursorMonth }"
        @click="openMonth(month.monthIndex)"
      >
        <p class="mini-title">{{ month.label }}</p>
        <div class="mini-grid">
          <span
            v-for="dot in month.dots"
            :key="dot.key"
            class="mini-dot"
            :class="{
              muted: !dot.inMonth,
              'has-event': dot.hasEvent,
              'has-highlight': dot.hasHighlight,
            }"
          />
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { WEEKDAY_LABELS } from '../constants/timeSlots'

export type CalendarMode = 'day' | 'month' | 'year'

export interface DaySlotRow {
  timeSlot: string
  status: 'vacant' | 'booked' | 'closed'
  label?: string
}

const props = withDefaults(
  defineProps<{
    selectedDate?: string | null
    eventDates?: string[]
    highlightDates?: string[]
    eventLabelsByDate?: Record<string, string[]>
    minDate?: string | null
    onlyHighlightSelectable?: boolean
    /** Timeline rows for day view (vacant / booked / closed). */
    daySlots?: DaySlotRow[]
  }>(),
  {
    selectedDate: null,
    eventDates: () => [],
    highlightDates: () => [],
    eventLabelsByDate: () => ({}),
    minDate: null,
    onlyHighlightSelectable: false,
    daySlots: () => [],
  },
)

const emit = defineEmits<{
  'select-date': [date: string]
}>()

const todayIso = new Date().toISOString().slice(0, 10)
const initial = props.selectedDate || todayIso
const start = new Date(`${initial}T00:00:00`)
const cursorYear = ref(start.getFullYear())
const cursorMonth = ref(start.getMonth())
const mode = ref<CalendarMode>('month')

const eventSet = computed(() => new Set(props.eventDates))
const highlightSet = computed(() => new Set(props.highlightDates))

watch(
  () => props.selectedDate,
  (value) => {
    if (!value) return
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return
    cursorYear.value = date.getFullYear()
    cursorMonth.value = date.getMonth()
  },
)

const headerLabel = computed(() => {
  if (mode.value === 'year') return String(cursorYear.value)
  if (mode.value === 'day') {
    const iso = props.selectedDate || todayIso
    const date = new Date(`${iso}T00:00:00`)
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }
  const date = new Date(cursorYear.value, cursorMonth.value, 1)
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

function toIso(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function shiftIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toIso(date.getFullYear(), date.getMonth(), date.getDate())
}

function isDisabled(iso: string, hasHighlight: boolean) {
  if (props.minDate && iso < props.minDate) return true
  if (props.onlyHighlightSelectable && !hasHighlight) return true
  return false
}

function formatSlot(slot: string) {
  return slot.replace('-', ' – ')
}

function slotLabel(slot: DaySlotRow) {
  if (slot.label) return slot.label
  if (slot.status === 'booked') return 'Booked'
  if (slot.status === 'vacant') return 'Vacant'
  return 'Closed'
}

function setMode(next: CalendarMode) {
  mode.value = next
  if (next === 'day' && !props.selectedDate) {
    emit('select-date', todayIso)
  }
}

const monthCells = computed(() => {
  const year = cursorYear.value
  const month = cursorMonth.value
  const first = new Date(year, month, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const cells: Array<{
    key: string
    iso: string
    day: number
    inMonth: boolean
    isToday: boolean
    hasEvent: boolean
    hasHighlight: boolean
    disabled: boolean
    labels: string[]
  }> = []

  for (let i = 0; i < 42; i += 1) {
    let day: number
    let inMonth = true
    let cellYear = year
    let cellMonth = month

    if (i < startPad) {
      day = prevDays - startPad + i + 1
      inMonth = false
      cellMonth = month - 1
      if (cellMonth < 0) {
        cellMonth = 11
        cellYear = year - 1
      }
    } else if (i >= startPad + daysInMonth) {
      day = i - startPad - daysInMonth + 1
      inMonth = false
      cellMonth = month + 1
      if (cellMonth > 11) {
        cellMonth = 0
        cellYear = year + 1
      }
    } else {
      day = i - startPad + 1
    }

    const iso = toIso(cellYear, cellMonth, day)
    const hasEvent = inMonth && eventSet.value.has(iso)
    const hasHighlight = inMonth && highlightSet.value.has(iso)
    cells.push({
      key: `${iso}-${i}`,
      iso,
      day,
      inMonth,
      isToday: iso === todayIso,
      hasEvent,
      hasHighlight,
      disabled: !inMonth || isDisabled(iso, hasHighlight),
      labels: inMonth ? props.eventLabelsByDate[iso] || [] : [],
    })
  }

  return cells
})

const yearMonths = computed(() => {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const label = new Date(cursorYear.value, monthIndex, 1).toLocaleDateString(undefined, {
      month: 'short',
    })
    const first = new Date(cursorYear.value, monthIndex, 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(cursorYear.value, monthIndex + 1, 0).getDate()
    const dots = Array.from({ length: 42 }, (__, i) => {
      let day: number
      let inMonth = true
      if (i < startPad) {
        day = 0
        inMonth = false
      } else if (i >= startPad + daysInMonth) {
        day = 0
        inMonth = false
      } else {
        day = i - startPad + 1
      }
      const iso = day ? toIso(cursorYear.value, monthIndex, day) : ''
      return {
        key: `${monthIndex}-${i}`,
        inMonth,
        hasEvent: iso ? eventSet.value.has(iso) : false,
        hasHighlight: iso ? highlightSet.value.has(iso) : false,
      }
    })
    return { key: `${cursorYear.value}-${monthIndex}`, monthIndex, label, dots }
  })
})

function step(delta: number) {
  if (mode.value === 'year') {
    cursorYear.value += delta
    return
  }
  if (mode.value === 'day') {
    const current = props.selectedDate || todayIso
    emit('select-date', shiftIso(current, delta))
    return
  }
  const next = new Date(cursorYear.value, cursorMonth.value + delta, 1)
  cursorYear.value = next.getFullYear()
  cursorMonth.value = next.getMonth()
}

function goToday() {
  const now = new Date()
  cursorYear.value = now.getFullYear()
  cursorMonth.value = now.getMonth()
  if (mode.value === 'year') mode.value = 'month'
  emit('select-date', todayIso)
}

function openMonth(monthIndex: number) {
  cursorMonth.value = monthIndex
  mode.value = 'month'
}

function onSelect(cell: { iso: string; disabled: boolean }) {
  if (cell.disabled) return
  emit('select-date', cell.iso)
}
</script>

<style scoped>
.cal-grid {
  display: grid;
  gap: 0.85rem;
}

.cal-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.nav-group,
.mode-toggle {
  display: inline-flex;
  gap: 0.35rem;
}

.nav-btn,
.mode-toggle button {
  font-family: 'Manrope', sans-serif;
  border: 1px solid var(--lh-line);
  border-radius: 0.65rem;
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  padding: 0.4rem 0.7rem;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
}

.nav-btn.today {
  text-transform: lowercase;
}

.mode-toggle button.active,
.nav-btn:hover,
.mode-toggle button:hover {
  background: var(--lh-warm-soft);
  border-color: rgba(196, 165, 116, 0.45);
  color: var(--lh-warm);
}

.cal-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--lh-warm);
  margin: 0;
}

.day-view {
  display: grid;
  gap: 0.65rem;
}

.day-hint,
.day-empty {
  font-family: 'Manrope', sans-serif;
  margin: 0;
  color: var(--lh-muted);
  font-size: 0.86rem;
}

.day-empty {
  font-style: italic;
  color: var(--lh-faint);
}

.slot-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--lh-line);
}

.slot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  background: var(--lh-bg-elevated);
  font-family: 'Manrope', sans-serif;
}

.slot-row.vacant {
  background: rgba(126, 184, 158, 0.12);
}

.slot-row.booked {
  background: rgba(196, 165, 116, 0.18);
  color: var(--lh-warm);
}

.slot-row.closed {
  background: #14181e;
  color: var(--lh-faint);
}

.slot-time {
  font-weight: 700;
  font-size: 0.9rem;
}

.slot-status {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.slot-row.vacant .slot-status {
  color: var(--lh-accent);
}

.weekday-row,
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekday-row {
  gap: 0.2rem;
  margin-bottom: 0.35rem;
}

.weekday-row span {
  font-family: 'Manrope', sans-serif;
  text-align: center;
  font-size: 0.78rem;
  color: var(--lh-faint);
  font-weight: 700;
}

.day-grid {
  gap: 1px;
  background: var(--lh-line);
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  overflow: hidden;
}

.day-cell {
  min-height: 4.4rem;
  border: none;
  background: var(--lh-bg-elevated);
  color: var(--lh-ink);
  text-align: left;
  padding: 0.4rem 0.45rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-family: 'Manrope', sans-serif;
}

.day-cell.muted {
  color: var(--lh-faint);
  background: #14181e;
}

.day-cell.today .day-num {
  color: var(--lh-warm);
  font-weight: 800;
}

.day-cell.has-event,
.day-cell.has-highlight {
  background: rgba(196, 165, 116, 0.18);
  color: var(--lh-warm);
}

.day-cell.selected {
  outline: 2px solid var(--lh-warm);
  outline-offset: -2px;
  z-index: 1;
}

.day-cell.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.day-cell:not(.disabled):hover {
  background: rgba(196, 165, 116, 0.28);
}

.day-num {
  font-size: 0.86rem;
  font-weight: 700;
}

.day-labels {
  display: grid;
  gap: 0.1rem;
  font-size: 0.68rem;
  line-height: 1.2;
  color: var(--lh-warm);
}

.year-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.75rem;
}

.mini-month {
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: var(--lh-bg-elevated);
  color: var(--lh-ink);
  padding: 0.65rem;
  cursor: pointer;
  text-align: left;
}

.mini-month:hover,
.mini-month.active {
  border-color: rgba(196, 165, 116, 0.45);
  background: rgba(196, 165, 116, 0.1);
}

.mini-title {
  font-family: 'Fraunces', Georgia, serif;
  color: var(--lh-warm);
  margin: 0 0 0.45rem;
  font-size: 0.95rem;
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.18rem;
}

.mini-dot {
  aspect-ratio: 1;
  border-radius: 0.2rem;
  background: rgba(231, 236, 239, 0.08);
}

.mini-dot.muted {
  opacity: 0.25;
}

.mini-dot.has-event,
.mini-dot.has-highlight {
  background: var(--lh-warm);
}

@media (max-width: 640px) {
  .day-cell {
    min-height: 3.4rem;
    padding: 0.28rem;
  }

  .day-labels {
    display: none;
  }

  .cal-title {
    width: 100%;
    order: -1;
  }
}
</style>
