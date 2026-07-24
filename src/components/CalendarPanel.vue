<template>
  <section class="panel">
    <div class="section-head">
      <h2>{{ title }}</h2>
    </div>
    <p class="subtitle">{{ subtitle }}</p>

    <p v-if="loading" class="empty">Loading calendar...</p>
    <template v-else>
      <CalendarGrid
        :selected-date="selectedDate"
        :event-dates="eventDates"
        :highlight-dates="highlightDates"
        :event-labels-by-date="eventLabelsByDate"
        :mark-unavailable-days="markUnavailableDays"
        @select-date="selectedDate = $event"
      />

      <div class="legend" v-if="showLegend">
        <span v-if="eventDates.length" class="legend-item event">Scheduled</span>
        <span v-if="highlightDates.length" class="legend-item open">{{
          highlightLabel
        }}</span>
        <span v-if="markUnavailableDays" class="legend-item unavailable">Not Available</span>
      </div>

      <div class="day-detail">
        <h3>{{ detailHeading }}</h3>
        <p v-if="!selectedDayEvents.length && !selectedDayHighlights" class="empty detail-empty">
          {{ emptyText }}
        </p>
        <ul v-if="selectedDayEvents.length" class="event-list">
          <li v-for="item in selectedDayEvents" :key="item.id">
            <div class="event-top">
              <strong>{{ item.title }}</strong>
              <span class="chip" :data-provider="item.provider">{{ item.provider }}</span>
            </div>
            <p>
              {{ item.startTime }} – {{ item.endTime }}
              · {{ item.durationMinutes }} min
            </p>
            <p v-if="item.meetingInfo" class="meta">{{ item.meetingInfo }}</p>
            <p class="meta">
              Sync:
              <span :data-status="item.syncStatus">{{ item.syncStatus.replace('_', ' ') }}</span>
              <span v-if="item.externalEventId"> · {{ item.externalEventId }}</span>
            </p>
          </li>
        </ul>
        <p v-else-if="selectedDayHighlights" class="hint">{{ selectedDayHighlights }}</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CalendarEvent } from '../stores/calendar'
import CalendarGrid from './CalendarGrid.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    emptyText?: string
    events: CalendarEvent[]
    loading?: boolean
    highlightDates?: string[]
    highlightLabel?: string
    markUnavailableDays?: boolean
  }>(),
  {
    title: 'Calendar',
    subtitle: '',
    emptyText: 'No events on this day.',
    loading: false,
    highlightDates: () => [],
    highlightLabel: 'Teachers available',
    markUnavailableDays: false,
  },
)

const todayIso = new Date().toISOString().slice(0, 10)
const selectedDate = ref(todayIso)

const eventDates = computed(() => [...new Set(props.events.map((item) => item.eventDate))])

const showLegend = computed(
  () => eventDates.value.length > 0 || props.highlightDates.length > 0 || props.markUnavailableDays,
)

const eventLabelsByDate = computed(() => {
  const map: Record<string, string[]> = {}
  for (const item of props.events) {
    if (!map[item.eventDate]) map[item.eventDate] = []
    if (map[item.eventDate].length < 2) {
      map[item.eventDate].push(item.title)
    }
  }
  return map
})

const selectedDayEvents = computed(() =>
  props.events
    .filter((item) => item.eventDate === selectedDate.value)
    .sort((a, b) => a.startTime.localeCompare(b.startTime)),
)

const selectedDayHighlights = computed(() => {
  if (!props.highlightDates.includes(selectedDate.value)) return ''
  if (selectedDayEvents.value.length) return ''
  return `${props.highlightLabel} on this day.`
})

const detailHeading = computed(() => {
  const date = new Date(`${selectedDate.value}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
})

watch(
  () => props.events,
  (events) => {
    if (!events.length) return
    if (events.some((item) => item.eventDate === selectedDate.value)) return
    const upcoming = events
      .map((item) => item.eventDate)
      .filter((date) => date >= todayIso)
      .sort()[0]
    if (upcoming) selectedDate.value = upcoming
  },
  { immediate: true },
)
</script>

<style scoped>
.panel {
  padding: 1.2rem 1.15rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
}

.section-head h2,
.day-detail h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-accent);
}

.section-head h2 {
  font-size: 1.2rem;
}

.day-detail h3 {
  font-size: 1.05rem;
  margin-bottom: 0.55rem;
}

.subtitle,
.empty,
p,
strong,
.chip,
.meta,
.hint,
.legend {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  margin-top: 0.35rem;
  margin-bottom: 0.9rem;
  color: var(--lh-muted);
  font-size: 0.9rem;
}

.empty {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-style: italic;
  font-size: 0.9rem;
}

.detail-empty {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.85rem;
  font-size: 0.78rem;
  color: var(--lh-muted);
}

.legend-item::before {
  content: '';
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 0.15rem;
  margin-right: 0.35rem;
  background: var(--lh-warm);
  vertical-align: middle;
}

.legend-item.unavailable::before {
  background: rgba(231, 236, 239, 0.28);
  border: 1px solid rgba(231, 236, 239, 0.22);
  box-sizing: border-box;
}

.day-detail {
  margin-top: 1rem;
  padding-top: 0.95rem;
  border-top: 1px solid var(--lh-line);
}

.event-list {
  list-style: none;
  display: grid;
  gap: 0.55rem;
}

.event-list li {
  padding: 0.75rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.62);
}

.event-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.chip {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  padding: 0.15rem 0.4rem;
  border-radius: 0.4rem;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.chip[data-provider='google'] {
  background: rgba(66, 133, 244, 0.16);
  color: #8ab4f8;
}

.chip[data-provider='calendly'] {
  background: rgba(0, 107, 255, 0.14);
  color: #6ea8fe;
}

p {
  margin-top: 0.3rem;
  color: var(--lh-muted);
  font-size: 0.88rem;
}

.meta {
  font-size: 0.82rem;
}

.meta span[data-status='synced'] {
  color: var(--lh-accent);
  font-weight: 700;
}

.meta span[data-status='failed'] {
  color: var(--lh-danger);
  font-weight: 700;
}

.hint {
  color: var(--lh-warm);
  font-size: 0.9rem;
}
</style>
