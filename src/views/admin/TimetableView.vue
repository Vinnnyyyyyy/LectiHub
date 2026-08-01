<script setup lang="ts">
/**
 * Timetable — the admin workspace. Week grid on the left, unassigned request
 * drawer on the right; drag a card onto one of its preferred slots to assign.
 *
 * Drops are restricted to the request's own preferred slots because
 * POST /schedule-requests/:id/assign takes a slot id from that request.
 * Assigning to an arbitrary cell would need a new endpoint.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminScheduleStore } from '../../stores/adminSchedule'
import { useClassesStore, type ConfirmedSchedule } from '../../stores/classes'
import { useAvailabilityStore } from '../../stores/availability'
import type { ScheduleRequest } from '../../stores/schedule'
import { TIME_SLOTS } from '../../constants/timeSlots'
import { usePageEyebrow, usePageTitle } from '../../composables/usePageMeta'

const adminStore = useAdminScheduleStore()
const classesStore = useClassesStore()
const availabilityStore = useAvailabilityStore()

const { requests, loadingRequests } = storeToRefs(adminStore)
const { schedules, loading: loadingClasses } = storeToRefs(classesStore)
const { openByDate, timeSlots: storeTimeSlots } = storeToRefs(availabilityStore)

/** Prefer API slot grid from centre settings; fall back to 30-min defaults. */
const TIME_SLOT_ROWS = computed(() =>
  storeTimeSlots.value?.length ? storeTimeSlots.value : [...TIME_SLOTS],
)

const weekOffset = ref(0)
const draggingId = ref<number | null>(null)
const selectedId = ref<number | null>(null)
const hoverKey = ref<string | null>(null)
const assigningId = ref<number | null>(null)
const cardError = ref<{ id: number; message: string } | null>(null)
const banner = ref('')

/* ── Week maths ──────────────────────────────────────────── */

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Monday of the week `offset` weeks from today. */
const weekStart = computed(() => {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // 0 = Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
  monday.setDate(monday.getDate() + weekOffset.value * 7)
  return monday
})

const days = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.value)
    date.setDate(date.getDate() + index)
    return {
      iso: isoDate(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      dayNumber: date.getDate(),
      isToday: isoDate(date) === isoDate(new Date()),
      isPast: isoDate(date) < isoDate(new Date()),
    }
  }),
)

const rangeLabel = computed(() => {
  const first = days.value[0]!
  const last = days.value[6]!
  const start = new Date(`${first.iso}T00:00:00`)
  const end = new Date(`${last.iso}T00:00:00`)
  const sameMonth = start.getMonth() === end.getMonth()
  const startText = start.toLocaleDateString(undefined, {
    day: 'numeric',
    month: sameMonth ? undefined : 'long',
  })
  const endText = end.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return `${startText} – ${endText}`
})

usePageTitle(() => rangeLabel.value)
usePageEyebrow(() => {
  if (weekOffset.value === 0) return 'This week'
  if (weekOffset.value === 1) return 'Planning next week'
  if (weekOffset.value === -1) return 'Last week'
  return weekOffset.value > 0
    ? `${weekOffset.value} weeks ahead`
    : `${-weekOffset.value} weeks back`
})

/* ── Grid contents ───────────────────────────────────────── */

const cellKey = (date: string, slot: string) => `${date}|${slot}`

/** Label the gutter only on the hour — "09:00-09:30" yes, "09:30-10:00" no. */
const isHourStart = (slot: string) => slot.slice(3, 5) === '00'

const classesByCell = computed(() => {
  const map = new Map<string, ConfirmedSchedule[]>()
  const within = new Set(days.value.map((day) => day.iso))
  for (const item of schedules.value) {
    if (!within.has(item.classDate)) continue
    const key = cellKey(item.classDate, item.timeSlot)
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }
  return map
})

function openCount(date: string, slot: string) {
  const entry = openByDate.value[date]?.find((item) => item.timeSlot === slot)
  return entry?.availableTeacherCount ?? 0
}

/* ── Drawer ──────────────────────────────────────────────── */

const pending = computed(() => requests.value)

/** Preferred slots of the request being dragged or keyboard-selected. */
const activeRequest = computed(
  () => pending.value.find((r) => r.id === (draggingId.value ?? selectedId.value)) ?? null,
)

const validKeys = computed(() => {
  const set = new Set<string>()
  const request = activeRequest.value
  if (!request) return set
  const within = new Set(days.value.map((day) => day.iso))
  for (const slot of request.slots) {
    if (within.has(slot.preferredDate)) set.add(cellKey(slot.preferredDate, slot.timeSlot))
  }
  return set
})

/** Preferred slots that fall outside the visible week, so we can say so. */
const offWeekSlots = computed(() => {
  const request = activeRequest.value
  if (!request) return 0
  const within = new Set(days.value.map((day) => day.iso))
  return request.slots.filter((slot) => !within.has(slot.preferredDate)).length
})

function requestSubject(request: ScheduleRequest) {
  return request.program || (request.source === 'free_trial' ? 'Free trial' : 'Class')
}

function requestWhen(request: ScheduleRequest) {
  const first = request.slots[0]
  if (!first) return 'No preferred slots'
  const date = new Date(`${first.preferredDate}T00:00:00`)
  const label = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
  return `${label} · ${first.timeSlot.split('-')[0]} · ${request.slots.length} slot${
    request.slots.length === 1 ? '' : 's'
  }`
}

/* ── Assigning ───────────────────────────────────────────── */

function onDragStart(request: ScheduleRequest, event: DragEvent) {
  draggingId.value = request.id
  selectedId.value = null
  cardError.value = null
  event.dataTransfer?.setData('text/plain', String(request.id))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
  draggingId.value = null
  hoverKey.value = null
}

function onDragOver(key: string, event: DragEvent) {
  if (!validKeys.value.has(key)) return
  event.preventDefault()
  hoverKey.value = key
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onDrop(date: string, slot: string) {
  const request = activeRequest.value
  hoverKey.value = null
  if (!request || !validKeys.value.has(cellKey(date, slot))) return
  void assign(request, date, slot)
}

/**
 * Resolves a teacher for the target slot from the review payload, then assigns.
 * Prefers the highest-scoring candidate that is actually free for this slot.
 */
async function assign(request: ScheduleRequest, date: string, timeSlot: string) {
  assigningId.value = request.id
  cardError.value = null
  banner.value = ''

  try {
    const review = await adminStore.fetchRequestReview(request.id)
    const slot = review.request.slots.find(
      (item) => item.preferredDate === date && item.timeSlot === timeSlot,
    )
    const availability = review.slotAvailability.find(
      (item) => item.preferredDate === date && item.timeSlot === timeSlot,
    )
    const freeIds = new Set((availability?.availableTeachers ?? []).map((t) => t.id))

    const candidate =
      review.teacherCandidates
        .filter((item) => item.assignable && freeIds.has(item.id))
        .sort((a, b) => b.suitabilityScore - a.suitabilityScore)[0] ??
      (availability?.availableTeachers ?? [])[0]

    if (!candidate) {
      cardError.value = { id: request.id, message: 'No teacher is free for that slot.' }
      return
    }

    const result = await adminStore.assignTeacher(request.id, candidate.id, slot?.id ?? null)
    banner.value =
      result.message ||
      `Assigned ${result.request.assignedTeacher?.fullName || 'a teacher'} to ${
        request.student?.fullName || 'the student'
      }.`

    await Promise.allSettled([classesStore.fetchMine(), adminStore.fetchReviewLists()])
  } catch (err) {
    const message =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Could not assign that slot.'
    cardError.value = { id: request.id, message }
  } finally {
    assigningId.value = null
    draggingId.value = null
    selectedId.value = null
  }
}

function toggleSelect(request: ScheduleRequest) {
  selectedId.value = selectedId.value === request.id ? null : request.id
  cardError.value = null
}

/* ── Teacher load ────────────────────────────────────────── */

const teacherLoad = computed(() => {
  const within = new Set(days.value.map((day) => day.iso))
  const byTeacher = new Map<number, { name: string; minutes: number }>()

  for (const item of schedules.value) {
    if (!within.has(item.classDate)) continue
    const id = item.teacherId
    const name = item.teacher?.fullName ?? 'Unassigned'
    const entry = byTeacher.get(id) ?? { name, minutes: 0 }
    entry.minutes += item.durationMinutes || 30
    byTeacher.set(id, entry)
  }

  const TARGET = 20 * 60
  return [...byTeacher.entries()]
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      hours: (entry.minutes / 60).toFixed(entry.minutes % 60 ? 1 : 0),
      percent: Math.min(100, Math.round((entry.minutes / TARGET) * 100)),
      underused: entry.minutes < TARGET * 0.4,
    }))
    .sort((a, b) => b.percent - a.percent)
})

const loading = computed(() => loadingClasses.value || loadingRequests.value)

async function loadWeek() {
  const from = days.value[0]!.iso
  const to = days.value[6]!.iso
  await Promise.allSettled([availabilityStore.fetchOpen(from, to)])
}

function stepWeek(delta: number) {
  weekOffset.value += delta
  void loadWeek()
}

onMounted(async () => {
  await Promise.allSettled([classesStore.fetchMine(), adminStore.fetchReviewLists()])
  await loadWeek()
})
</script>

<template>
  <section class="timetable">
    <div class="toolbar">
      <div class="weeknav">
        <button type="button" class="step" aria-label="Previous week" @click="stepWeek(-1)">
          ‹
        </button>
        <button type="button" class="today" @click="((weekOffset = 0), loadWeek())">Today</button>
        <button type="button" class="step" aria-label="Next week" @click="stepWeek(1)">›</button>
      </div>

      <div class="legend" aria-hidden="true">
        <span class="key confirmed" />Confirmed <span class="key pending" />Awaiting teacher
        <span class="key open" />Open
      </div>
    </div>

    <p v-if="banner" class="banner" role="status">{{ banner }}</p>

    <div class="workspace">
      <div class="board">
        <div class="grid" :class="{ dragging: !!activeRequest }">
          <div class="gutter head" />
          <div
            v-for="day in days"
            :key="day.iso"
            class="dayhead"
            :class="{ today: day.isToday, past: day.isPast }"
          >
            <p class="dayname">{{ day.label }}</p>
            <p class="daynum">{{ day.dayNumber }}</p>
          </div>

          <template v-for="slot in TIME_SLOT_ROWS" :key="slot">
            <div class="gutter">
              <span v-if="isHourStart(slot)">{{ slot.split('-')[0] }}</span>
            </div>

            <!-- Always a div: swapping element types mid-drag would replace the
                 drop targets under the cursor. Only attributes change. -->
            <div
              v-for="day in days"
              :key="day.iso + slot"
              class="cell"
              :class="{
                past: day.isPast,
                droppable: validKeys.has(cellKey(day.iso, slot)),
                hovering: hoverKey === cellKey(day.iso, slot),
              }"
              :role="validKeys.has(cellKey(day.iso, slot)) ? 'button' : undefined"
              :tabindex="validKeys.has(cellKey(day.iso, slot)) ? 0 : undefined"
              :aria-label="
                validKeys.has(cellKey(day.iso, slot))
                  ? `Assign to ${day.label} ${slot.split('-')[0]}`
                  : undefined
              "
              @dragover="onDragOver(cellKey(day.iso, slot), $event)"
              @dragleave="hoverKey = null"
              @drop="onDrop(day.iso, slot)"
              @click="validKeys.has(cellKey(day.iso, slot)) && onDrop(day.iso, slot)"
              @keydown.enter.prevent="
                validKeys.has(cellKey(day.iso, slot)) && onDrop(day.iso, slot)
              "
              @keydown.space.prevent="
                validKeys.has(cellKey(day.iso, slot)) && onDrop(day.iso, slot)
              "
            >
              <span
                v-for="item in classesByCell.get(cellKey(day.iso, slot)) ?? []"
                :key="item.id"
                class="block"
                :class="item.studentId ? 'confirmed' : 'pendingblock'"
                :title="`${item.subject || item.title} · ${item.teacher?.fullName ?? 'Unassigned'}`"
              >
                {{ item.subject || item.title }} ·
                {{ item.student?.fullName?.split(' ')[0] ?? 'Open' }}
              </span>

              <span
                v-if="
                  !classesByCell.has(cellKey(day.iso, slot)) &&
                  !validKeys.has(cellKey(day.iso, slot)) &&
                  openCount(day.iso, slot) > 0
                "
                class="block open"
              >
                {{ openCount(day.iso, slot) }} open
              </span>

              <span v-if="validKeys.has(cellKey(day.iso, slot))" class="block drop">
                Drop to book
              </span>
            </div>
          </template>
        </div>

        <div v-if="teacherLoad.length" class="load">
          <div v-for="teacher in teacherLoad" :key="teacher.id" class="load-item">
            <p class="load-name">{{ teacher.name }}</p>
            <span class="meter" aria-hidden="true">
              <span class="meter-fill" :style="{ width: `${teacher.percent}%` }" />
            </span>
            <p class="load-value">
              {{ teacher.hours }} / 20h
              <span v-if="teacher.underused" class="underused">· underused</span>
            </p>
          </div>
        </div>
      </div>

      <aside class="drawer" aria-label="Unassigned requests">
        <div class="drawer-head">
          <p class="eyebrow">Unassigned</p>
          <p class="count">{{ pending.length }}</p>
        </div>
        <p class="drawer-hint">
          Drag a card onto one of its preferred slots, or select it and choose a highlighted slot.
        </p>

        <p v-if="loading" class="drawer-empty">Loading…</p>
        <p v-else-if="!pending.length" class="drawer-empty">Nothing waiting. The queue is clear.</p>

        <div v-else class="drawer-list">
          <div
            v-for="request in pending"
            :key="request.id"
            class="reqcard"
            :class="{
              selected: selectedId === request.id,
              dragging: draggingId === request.id,
              busy: assigningId === request.id,
            }"
            draggable="true"
            role="button"
            tabindex="0"
            :aria-pressed="selectedId === request.id"
            @dragstart="onDragStart(request, $event)"
            @dragend="onDragEnd"
            @click="toggleSelect(request)"
            @keydown.enter.prevent="toggleSelect(request)"
            @keydown.space.prevent="toggleSelect(request)"
          >
            <div class="reqhead">
              <svg width="10" height="14" viewBox="0 0 10 14" class="grip" aria-hidden="true">
                <circle cx="2" cy="2" r="1" />
                <circle cx="8" cy="2" r="1" />
                <circle cx="2" cy="7" r="1" />
                <circle cx="8" cy="7" r="1" />
                <circle cx="2" cy="12" r="1" />
                <circle cx="8" cy="12" r="1" />
              </svg>
              <p class="reqname">{{ request.student?.fullName || 'Student' }}</p>
              <span class="reqchip">{{ requestSubject(request) }}</span>
            </div>
            <p class="reqwhen">{{ requestWhen(request) }}</p>
            <p v-if="assigningId === request.id" class="reqnote">Assigning…</p>
            <p v-else-if="cardError?.id === request.id" class="reqnote error">
              {{ cardError.message }}
            </p>
            <p v-else-if="selectedId === request.id && !validKeys.size" class="reqnote warn">
              No preferred slots this week{{
                offWeekSlots ? ` — ${offWeekSlots} in another week` : ''
              }}
            </p>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.timetable {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
}

.weeknav {
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

.key.confirmed {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.key.pending {
  background: var(--lh-warm-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-warm) 32%, transparent);
}

.key.open {
  background: color-mix(in srgb, var(--lh-ink) 5%, transparent);
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
}

.banner {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 12.5px;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: 18px;
  align-items: start;
}

.board {
  min-width: 0;
}

.grid {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(0, 1fr));
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.gutter {
  padding: 0 7px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 10px;
  color: var(--lh-dim);
  border-right: 1px solid var(--lh-line);
}

.gutter.head {
  height: auto;
}

.dayhead {
  padding: 9px 0 7px;
  text-align: center;
  border-left: 1px solid var(--lh-line);
  border-bottom: 1px solid var(--lh-line);
}

.dayhead.past {
  opacity: 0.55;
}

.dayname {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--lh-dim);
}

.daynum {
  margin-top: 2px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 17px;
  line-height: 1;
}

.dayhead.today .daynum,
.dayhead.today .dayname {
  color: var(--lh-accent);
}

.cell {
  position: relative;
  height: 26px;
  padding: 2px 3px;
  border-left: 1px solid var(--lh-line);
  border-top: 1px solid var(--lh-line);
  background: transparent;
  font: inherit;
  text-align: left;
  overflow: hidden;
}

.cell.past {
  background: color-mix(in srgb, var(--lh-void) 40%, transparent);
}

.cell.droppable {
  cursor: pointer;
}

.cell.hovering {
  background: var(--lh-accent-soft);
}

.cell.droppable:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.block {
  display: block;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block.confirmed {
  background: color-mix(in srgb, var(--lh-accent) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 30%, transparent);
  color: var(--lh-ink);
}

.block.pendingblock {
  background: color-mix(in srgb, var(--lh-warm) 15%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-warm) 32%, transparent);
  color: var(--lh-warm);
}

.block.open {
  background: color-mix(in srgb, var(--lh-ink) 5%, transparent);
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
  color: var(--lh-faint);
}

.block.drop {
  border: 1px dashed color-mix(in srgb, var(--lh-accent) 60%, transparent);
  background: color-mix(in srgb, var(--lh-accent) 6%, transparent);
  color: var(--lh-accent);
}

.load {
  display: flex;
  gap: 22px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--lh-line);
  flex-wrap: wrap;
}

.load-item {
  min-width: 9rem;
}

.load-name {
  font-size: 12px;
  font-weight: 600;
}

.meter {
  display: block;
  height: 4px;
  margin: 5px 0 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  overflow: hidden;
}

.meter-fill {
  display: block;
  height: 100%;
  background: var(--lh-accent);
}

.load-value {
  font-size: 11px;
  color: var(--lh-faint);
}

.underused {
  color: var(--lh-warm);
}

/* ── Drawer ─────────────────────────────────────────────── */

.drawer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.drawer-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.count {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  line-height: 1;
  color: var(--lh-warm);
}

.drawer-hint {
  font-size: 11px;
  color: var(--lh-dim);
  line-height: 1.45;
}

.drawer-empty {
  padding: 12px 0;
  font-size: 12px;
  color: var(--lh-muted);
}

.drawer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reqcard {
  padding: 11px 12px;
  border-radius: var(--lh-radius-item);
  background: var(--lh-bg-elevated);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-warm) 24%, transparent);
  cursor: grab;
  transition: box-shadow var(--lh-ease);
}

.reqcard.selected {
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.reqcard.dragging {
  opacity: 0.5;
}

.reqcard.busy {
  cursor: progress;
}

.reqcard:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.reqhead {
  display: flex;
  align-items: center;
  gap: 8px;
}

.grip {
  fill: var(--lh-ghost);
  flex: 0 0 auto;
}

.reqname {
  font-size: 13px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reqchip {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 10px;
  font-weight: 800;
}

.reqwhen {
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--lh-muted);
}

.reqnote {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--lh-accent);
}

.reqnote.error {
  color: var(--lh-danger);
}

.reqnote.warn {
  color: var(--lh-warm);
}

@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .drawer {
    order: -1;
  }
}
</style>
