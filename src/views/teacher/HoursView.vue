<script setup lang="ts">
/**
 * Open hours & calendar sync (teacher 05) — the weekly pattern students can
 * book against, plus the calendar connections that block it automatically.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAvailabilityStore } from '../../stores/availability'
import { TIME_SLOTS } from '../../constants/timeSlots'
import { usePageEyebrow } from '../../composables/usePageMeta'
import CalendarConnectionsPanel from '../../components/CalendarConnectionsPanel.vue'
import CalendarPanel from '../../components/CalendarPanel.vue'
import { useCalendarStore } from '../../stores/calendar'

const availabilityStore = useAvailabilityStore()
const calendarStore = useCalendarStore()
const { mySlots, loadingMine, savingMine, error } = storeToRefs(availabilityStore)
const { loading: loadingCalendar } = storeToRefs(calendarStore)

const calendarUpcoming = computed(() => calendarStore.upcoming)

/** Mon–Fri; the center is closed at weekends. */
const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
]
const LUNCH_SLOT = '12:00-13:00'

/** Local edit buffer, keyed `weekday|slot`. Saved as a whole. */
const openSet = ref(new Set<string>())
const savedSnapshot = ref('')
const message = ref('')

const key = (weekday: number, slot: string) => `${weekday}|${slot}`

function syncFromStore() {
  const next = new Set<string>()
  for (const slot of mySlots.value) {
    if (slot.isOpen) next.add(key(slot.weekday, slot.timeSlot))
  }
  openSet.value = next
  savedSnapshot.value = [...next].sort().join(',')
}

watch(mySlots, syncFromStore, { immediate: true })

const dirty = computed(() => [...openSet.value].sort().join(',') !== savedSnapshot.value)

/** Time rows with the lunch gap re-inserted so the column reads continuously. */
const rows = computed(() => {
  const out: { slot: string; closed: boolean }[] = []
  let lunchAdded = false
  for (const slot of TIME_SLOTS) {
    if (!lunchAdded && slot >= '13:00') {
      out.push({ slot: LUNCH_SLOT, closed: true })
      lunchAdded = true
    }
    out.push({ slot, closed: false })
  }
  return out
})

const isHourStart = (slot: string) => slot.slice(3, 5) === '00'
const isOpen = (weekday: number, slot: string) => openSet.value.has(key(weekday, slot))

const openCount = computed(() => openSet.value.size)

usePageEyebrow(() => 'Students can only request slots you leave open')

function toggle(weekday: number, slot: string) {
  const id = key(weekday, slot)
  const next = new Set(openSet.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openSet.value = next
  message.value = ''
}

function copyMondayToWeek() {
  const monday = [...openSet.value].filter((id) => id.startsWith('1|'))
  const next = new Set([...openSet.value].filter((id) => id.startsWith('1|')))
  for (const day of WEEKDAYS.slice(1)) {
    for (const id of monday) {
      next.add(`${day.value}|${id.split('|')[1]}`)
    }
  }
  openSet.value = next
  message.value = ''
}

function clearAll() {
  openSet.value = new Set()
  message.value = ''
}

async function save() {
  const slots = WEEKDAYS.flatMap((day) =>
    TIME_SLOTS.map((slot) => ({
      weekday: day.value,
      timeSlot: slot,
      isOpen: openSet.value.has(key(day.value, slot)),
    })),
  )

  try {
    await availabilityStore.saveMine(slots)
    message.value = 'Open hours saved. Students can request these times.'
  } catch {
    // store surfaces the error
  }
}

onMounted(() => {
  if (!mySlots.value.length) void availabilityStore.fetchMine()
})
</script>

<template>
  <section class="hours">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <div class="split">
      <div class="col">
        <div class="card">
          <div class="card-head">
            <div>
              <p class="card-label">Weekly pattern</p>
              <p class="card-note">Click a cell to toggle · 30-minute slots</p>
            </div>
            <button
              type="button"
              class="btn-primary"
              :disabled="!dirty || savingMine"
              @click="save"
            >
              {{ savingMine ? 'Saving…' : 'Save availability' }}
            </button>
          </div>

          <p v-if="loadingMine" class="loading">Loading your pattern…</p>

          <div v-else class="gridwrap">
            <div class="grid">
              <div class="gutter" />
              <div v-for="day in WEEKDAYS" :key="day.value" class="dayhead">
                {{ day.label.toUpperCase() }}
              </div>

              <template v-for="row in rows" :key="row.slot">
                <div class="gutter">
                  <span v-if="isHourStart(row.slot)">{{ row.slot.split('-')[0] }}</span>
                </div>

                <template v-if="row.closed">
                  <div v-for="day in WEEKDAYS" :key="day.value + row.slot" class="cell lunch">
                    <span class="cell-text">lunch</span>
                  </div>
                </template>

                <button
                  v-for="day in WEEKDAYS"
                  v-else
                  :key="day.value + row.slot"
                  type="button"
                  class="cell"
                  :class="isOpen(day.value, row.slot) ? 'open' : 'shut'"
                  :aria-pressed="isOpen(day.value, row.slot)"
                  :aria-label="`${day.label} ${row.slot.split('-')[0]}`"
                  @click="toggle(day.value, row.slot)"
                />
              </template>
            </div>
          </div>

          <div class="gridfoot">
            <div class="legend" aria-hidden="true">
              <span class="key open" />Open — bookable <span class="key shut" />Unavailable
            </div>
            <div class="bulk">
              <button type="button" class="btn-text" @click="copyMondayToWeek">
                Copy Monday to all weekdays
              </button>
              <button type="button" class="btn-text" @click="clearAll">Clear all</button>
            </div>
          </div>
        </div>

        <p class="summary">
          <strong>{{ openCount }}</strong> open slot{{ openCount === 1 ? '' : 's' }} in your weekly
          pattern. The admin sees these when matching new bookings.
        </p>
      </div>

      <aside class="col side">
        <div class="card">
          <p class="card-label">Calendar sync</p>
          <p class="card-note">Busy events block your open hours automatically.</p>
          <div class="connections">
            <CalendarConnectionsPanel />
          </div>
        </div>
      </aside>
    </div>

    <CalendarPanel
      title="My calendar"
      subtitle="Gold days mark your scheduled classes."
      empty-text="Nothing on this day yet."
      :events="calendarUpcoming"
      :loading="loadingCalendar"
    />
  </section>
</template>

<style scoped>
.hours {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.banner {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 12.5px;
}

.banner.error {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 24px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.card {
  padding: 18px 20px;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
}

.card-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.card-note {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

.btn-primary {
  margin-left: auto;
  height: 31px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.btn-primary:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent-hover);
}

.loading {
  font-size: 12.5px;
  color: var(--lh-muted);
}

.gridwrap {
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
}

.grid {
  display: grid;
  grid-template-columns: 52px repeat(5, 1fr);
  gap: 3px;
}

.gutter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 9px;
  font-size: 10px;
  color: var(--lh-dim);
}

.dayhead {
  padding-bottom: 7px;
  text-align: center;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--lh-dim);
}

.cell {
  height: 30px;
  border: 0;
  border-radius: 5px;
  display: grid;
  place-items: center;
  font: inherit;
  transition:
    background var(--lh-ease),
    box-shadow var(--lh-ease);
}

.cell.open {
  background: color-mix(in srgb, var(--lh-accent) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 30%, transparent);
  cursor: pointer;
}

.cell.shut {
  background: color-mix(in srgb, var(--lh-ink) 3%, transparent);
  cursor: pointer;
}

.cell.shut:hover {
  background: color-mix(in srgb, var(--lh-accent) 8%, transparent);
}

.cell.lunch {
  background: color-mix(in srgb, var(--lh-ink) 1%, transparent);
}

.cell-text {
  font-size: 9.5px;
  color: var(--lh-ghost);
}

.cell:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.gridfoot {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--lh-faint);
}

.key {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  margin-left: 9px;
}

.key.open {
  background: color-mix(in srgb, var(--lh-accent) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 30%, transparent);
}

.key.shut {
  background: color-mix(in srgb, var(--lh-ink) 3%, transparent);
}

.bulk {
  margin-left: auto;
  display: flex;
  gap: 14px;
}

.btn-text {
  border: 0;
  background: transparent;
  color: var(--lh-accent);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.btn-text:hover {
  color: var(--lh-accent-hover);
}

.btn-text:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.summary {
  font-size: 12px;
  color: var(--lh-muted);
}

.summary strong {
  color: var(--lh-ink);
}

.connections {
  margin-top: 12px;
}

@media (max-width: 1100px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
