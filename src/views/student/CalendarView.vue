<script setup lang="ts">
/**
 * Calendar (student). Not one of the 20 boards — the design gives students a
 * week list and a booking grid rather than a month view — so this is built in
 * the same language rather than to a reference frame.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCalendarStore, type CalendarEvent } from '../../stores/calendar'
import { useAvailabilityStore } from '../../stores/availability'
import { usePageEyebrow, usePageTitle } from '../../composables/usePageMeta'

const calendarStore = useCalendarStore()
const availabilityStore = useAvailabilityStore()

const { events, loading } = storeToRefs(calendarStore)
const { openDates } = storeToRefs(availabilityStore)

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const mode = ref<'month' | 'year'>('month')
const monthOffset = ref(0)
const selectedDate = ref<string | null>(null)

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const today = isoDate(new Date())

const cursor = computed(() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + monthOffset.value, 1)
})

usePageTitle(() =>
  mode.value === 'year'
    ? String(cursor.value.getFullYear())
    : cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
)

const yearMonths = computed(() => {
  const year = cursor.value.getFullYear()
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const label = new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: 'short' })
    const first = new Date(year, monthIndex, 1)
    const offsetToMonday = (first.getDay() + 6) % 7
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const dots = Array.from({ length: 42 }, (__, i) => {
      const day = i - offsetToMonday + 1
      const inMonth = day >= 1 && day <= daysInMonth
      const iso = inMonth ? isoDate(new Date(year, monthIndex, day)) : ''
      return {
        key: `${monthIndex}-${i}`,
        inMonth,
        hasEvent: iso ? eventsByDate.value.has(iso) : false,
        hasHighlight: iso ? openSet.value.has(iso) : false,
      }
    })
    return { key: `${year}-${monthIndex}`, monthIndex, label, dots }
  })
})

function openMonth(monthIndex: number) {
  const now = new Date()
  monthOffset.value = (cursor.value.getFullYear() - now.getFullYear()) * 12 + (monthIndex - now.getMonth())
  mode.value = 'month'
}

function step(delta: number) {
  if (mode.value === 'year') {
    monthOffset.value += delta * 12
    return
  }
  monthOffset.value += delta
}

function goToday() {
  monthOffset.value = 0
  mode.value = 'month'
  selectedDate.value = today
}

/** Six-week grid starting on the Monday on or before the 1st. */
const cells = computed(() => {
  const first = cursor.value
  const offsetToMonday = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offsetToMonday)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    const iso = isoDate(date)
    return {
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === first.getMonth(),
      isToday: iso === today,
    }
  })
})

const eventsByDate = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events.value) {
    const bucket = map.get(event.eventDate)
    if (bucket) bucket.push(event)
    else map.set(event.eventDate, [event])
  }
  return map
})

const openSet = computed(() => new Set(openDates.value))

const monthEvents = computed(() =>
  events.value
    .filter((event) => {
      const date = new Date(`${event.eventDate}T00:00:00`)
      return (
        date.getMonth() === cursor.value.getMonth() &&
        date.getFullYear() === cursor.value.getFullYear()
      )
    })
    .sort((a, b) => (a.eventDate + a.startTime < b.eventDate + b.startTime ? -1 : 1)),
)

const dayEvents = computed(() =>
  selectedDate.value ? (eventsByDate.value.get(selectedDate.value) ?? []) : [],
)

usePageEyebrow(() => {
  const count = monthEvents.value.length
  return count ? `${count} class${count === 1 ? '' : 'es'} this month` : 'Nothing booked this month'
})

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function eventTime(event: CalendarEvent) {
  if (event.startTime && event.endTime) return `${event.startTime} – ${event.endTime}`
  return `${event.durationMinutes || 30} min`
}

onMounted(async () => {
  await Promise.allSettled([calendarStore.fetchMine(), availabilityStore.fetchOpen()])
})
</script>

<template>
  <section class="calendar">
    <div class="split">
      <div class="board">
        <div class="toolbar">
          <div class="nav">
            <button type="button" class="step" aria-label="Previous" @click="step(-1)">‹</button>
            <button type="button" class="today" @click="goToday">Today</button>
            <button type="button" class="step" aria-label="Next" @click="step(1)">›</button>
          </div>

          <div class="mode-toggle" role="group" aria-label="Calendar view">
            <button type="button" :class="{ active: mode === 'month' }" @click="mode = 'month'">
              Month
            </button>
            <button type="button" :class="{ active: mode === 'year' }" @click="mode = 'year'">
              Year
            </button>
          </div>

          <div class="legend" aria-hidden="true">
            <span class="key booked" />Your class <span class="key open" />Teachers free
          </div>
        </div>

        <div v-if="mode === 'month'" class="grid">
          <p v-for="name in WEEKDAYS" :key="name" class="weekday">{{ name }}</p>

          <button
            v-for="cell in cells"
            :key="cell.iso"
            type="button"
            class="cell"
            :class="{
              outside: !cell.inMonth,
              today: cell.isToday,
              selected: selectedDate === cell.iso,
              booked: eventsByDate.has(cell.iso),
            }"
            :aria-label="dayLabel(cell.iso)"
            :aria-pressed="selectedDate === cell.iso"
            @click="selectedDate = selectedDate === cell.iso ? null : cell.iso"
          >
            <span class="daynum">{{ cell.day }}</span>
            <span class="marks">
              <span
                v-for="event in (eventsByDate.get(cell.iso) ?? []).slice(0, 3)"
                :key="event.id"
                class="mark"
                aria-hidden="true"
              />
              <span
                v-if="!eventsByDate.has(cell.iso) && openSet.has(cell.iso)"
                class="mark open"
                aria-hidden="true"
              />
            </span>
          </button>
        </div>

        <div v-else class="year-view">
          <button
            v-for="month in yearMonths"
            :key="month.key"
            type="button"
            class="mini-month"
            :class="{ active: month.monthIndex === cursor.getMonth() }"
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
                  'has-highlight': dot.hasHighlight && !dot.hasEvent,
                }"
              />
            </div>
          </button>
        </div>
      </div>

      <aside class="side">
        <div v-if="selectedDate" class="panel">
          <p class="eyebrow">{{ dayLabel(selectedDate) }}</p>

          <p v-if="!dayEvents.length" class="empty small">
            Nothing booked.
            <template v-if="openSet.has(selectedDate)">
              Teachers have time open —
              <RouterLink class="link" to="/student/book">book a class</RouterLink>.
            </template>
          </p>

          <div v-for="event in dayEvents" v-else :key="event.id" class="event">
            <p class="event-time">{{ eventTime(event) }}</p>
            <p class="event-title">{{ event.title }}</p>
            <p v-if="event.description" class="event-meta">{{ event.description }}</p>
            <a
              v-if="event.meetingLink"
              class="link"
              :href="event.meetingLink"
              target="_blank"
              rel="noopener"
            >
              Open meeting link →
            </a>
          </div>
        </div>

        <div class="panel">
          <p class="eyebrow">This month</p>
          <p v-if="loading" class="empty small">Loading…</p>
          <p v-else-if="!monthEvents.length" class="empty small">Nothing booked this month.</p>

          <button
            v-for="event in monthEvents"
            v-else
            :key="event.id"
            type="button"
            class="row"
            :class="{ active: selectedDate === event.eventDate }"
            @click="selectedDate = event.eventDate"
          >
            <span class="row-date">
              {{
                new Date(`${event.eventDate}T00:00:00`).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })
              }}
            </span>
            <span class="row-copy">
              <span class="row-title">{{ event.title }}</span>
              <span class="row-time">{{ eventTime(event) }}</span>
            </span>
          </button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.calendar {
  min-width: 0;
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}

.board {
  min-width: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step,
.today {
  height: 29px;
  border: 0;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
  background: transparent;
  color: var(--lh-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.step {
  width: 29px;
  font-size: 15px;
  line-height: 1;
}

.today {
  padding: 0 12px;
}

.step:hover,
.today:hover {
  color: var(--lh-ink);
}

.step:focus-visible,
.today:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.legend {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  font-size: 11px;
  color: var(--lh-faint);
}

.key {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  margin-left: 9px;
}

.key.booked {
  background: var(--lh-accent);
}

.key.open {
  background: color-mix(in srgb, var(--lh-ink) 18%, transparent);
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  background: var(--lh-line);
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
}

.weekday {
  padding: 9px 0;
  background: var(--lh-rail);
  text-align: center;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-height: 68px;
  padding: 9px 4px;
  border: 0;
  background: var(--lh-bg);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.cell:hover {
  background: var(--lh-bg-elevated);
}

.cell.outside {
  color: var(--lh-ghost);
}

.cell.outside .daynum {
  opacity: 0.5;
}

.cell.selected {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.cell:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.daynum {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 15px;
  line-height: 1;
}

.cell.today .daynum {
  color: var(--lh-accent);
  font-weight: 600;
}

.marks {
  display: flex;
  gap: 3px;
  min-height: 5px;
}

.mark {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lh-accent);
}

.mark.open {
  background: color-mix(in srgb, var(--lh-ink) 18%, transparent);
}

/* ── Side ───────────────────────────────────────────────── */

.side {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.event {
  margin-top: 12px;
  padding: 13px 14px;
  border-radius: var(--lh-radius-item);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.event-time {
  font-size: 11px;
  font-weight: 700;
  color: var(--lh-accent);
}

.event-title {
  margin-top: 5px;
  font-size: 13.5px;
  font-weight: 700;
}

.event-meta {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--lh-muted);
}

.link {
  display: inline-block;
  margin-top: 9px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--lh-accent);
  text-decoration: none;
}

.link:hover {
  color: var(--lh-accent-hover);
}

.row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 0;
  border: 0;
  border-bottom: 1px solid var(--lh-line);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row:first-of-type {
  margin-top: 8px;
  border-top: 1px solid var(--lh-line);
}

.row.active .row-title,
.row:hover .row-title {
  color: var(--lh-accent);
}

.row:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.row-date {
  flex: 0 0 3.2rem;
  font-size: 11px;
  font-weight: 700;
  color: var(--lh-dim);
}

.row-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-title {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--lh-ease);
}

.row-time {
  font-size: 11px;
  color: var(--lh-faint);
}

.empty {
  font-size: 12.5px;
  color: var(--lh-muted);
}

.empty.small {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 960px) {
  .split {
    grid-template-columns: 1fr;
  }

  .cell {
    min-height: 54px;
  }
}
</style>
