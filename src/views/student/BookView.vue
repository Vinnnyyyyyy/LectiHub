<script setup lang="ts">
/**
 * Book a class — pick up to three preferred slots from what teachers have
 * left open, then submit. The center assigns a teacher and confirms one.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAvailabilityStore } from '../../stores/availability'
import { useScheduleStore } from '../../stores/schedule'
import { TIME_SLOTS } from '../../constants/timeSlots'
import { TRIAL_PROGRAMS } from '../../constants/trialForm'
import { usePageEyebrow } from '../../composables/usePageMeta'

const availabilityStore = useAvailabilityStore()
const scheduleStore = useScheduleStore()

const { openByDate, loadingOpen } = storeToRefs(availabilityStore)
const { submitting, error } = storeToRefs(scheduleStore)

/** Soft guide — consecutive same-day slots merge into one class on the server. */
const MAX_PICKS = 12
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th']
/** Server enforces today + 2 days. */
const LEAD_DAYS = 2
/** Rendered as a closed band so the day reads continuously. */
const LUNCH_SLOT = '12:00-13:00'

const weekOffset = ref(0)
const picks = ref<{ preferredDate: string; timeSlot: string }[]>([])
const subject = ref('')
const remarks = ref('')
const repeatWeekly = ref(false)
const successMessage = ref('')

const { requests, loading: loadingRequests } = storeToRefs(scheduleStore)

usePageEyebrow(() => `Pick your times · ${picks.value.length} chosen`)

/* ── Week ────────────────────────────────────────────────── */

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const earliest = computed(() => {
  const date = new Date()
  date.setDate(date.getDate() + LEAD_DAYS)
  return isoDate(date)
})

/** Mon–Fri only; the center is closed at weekends. */
const days = computed(() => {
  const now = new Date()
  const offsetToMonday = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetToMonday)
  monday.setDate(monday.getDate() + weekOffset.value * 7)

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(date.getDate() + index)
    const iso = isoDate(date)
    return {
      iso,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      dayNumber: date.getDate(),
      bookable: iso >= earliest.value,
    }
  })
})

const rangeLabel = computed(() => {
  const start = new Date(`${days.value[0]!.iso}T00:00:00`)
  const end = new Date(`${days.value[4]!.iso}T00:00:00`)
  const sameMonth = start.getMonth() === end.getMonth()
  return `${start.toLocaleDateString(undefined, {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
})

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

/* ── Slot state ──────────────────────────────────────────── */

function teachersFree(date: string, slot: string) {
  return openByDate.value[date]?.find((item) => item.timeSlot === slot)?.availableTeacherCount ?? 0
}

function pickIndex(date: string, slot: string) {
  return picks.value.findIndex((p) => p.preferredDate === date && p.timeSlot === slot)
}

function slotState(date: string, slot: string, bookable: boolean) {
  const index = pickIndex(date, slot)
  if (index >= 0) return 'picked'
  if (!bookable) return 'closed'
  return teachersFree(date, slot) > 0 ? 'open' : 'full'
}

function toggleSlot(date: string, slot: string, bookable: boolean) {
  const state = slotState(date, slot, bookable)
  if (state === 'closed' || state === 'full') return

  const index = pickIndex(date, slot)
  if (index >= 0) {
    picks.value.splice(index, 1)
    return
  }
  if (picks.value.length >= MAX_PICKS) return
  picks.value.push({ preferredDate: date, timeSlot: slot })
}

function removePick(index: number) {
  picks.value.splice(index, 1)
}

function slotLabel(date: string, slot: string) {
  const index = pickIndex(date, slot)
  return index >= 0 ? (ORDINALS[index] ?? `${index + 1}`) : ''
}

/** Consecutive same-day slots preview as one class each (same merge rules as before). */
const bookingPreview = computed(() => {
  const sorted = [...picks.value].sort((a, b) =>
    a.preferredDate === b.preferredDate
      ? a.timeSlot.localeCompare(b.timeSlot)
      : a.preferredDate.localeCompare(b.preferredDate),
  )
  const blocks: { preferredDate: string; timeSlot: string }[][] = []
  let current: { preferredDate: string; timeSlot: string }[] = []

  for (const slot of sorted) {
    if (!current.length) {
      current = [slot]
      continue
    }
    const prev = current[current.length - 1]!
    const prevEnd = prev.timeSlot.split('-')[1]
    const nextStart = slot.timeSlot.split('-')[0]
    if (prev.preferredDate === slot.preferredDate && prevEnd === nextStart) {
      current.push(slot)
    } else {
      blocks.push(current)
      current = [slot]
    }
  }
  if (current.length) blocks.push(current)

  return blocks.map((block) => {
    const start = block[0]!.timeSlot.split('-')[0]
    const end = block[block.length - 1]!.timeSlot.split('-')[1]
    const date = new Date(`${block[0]!.preferredDate}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    return `${date} ${start}–${end}`
  })
})

function formatRequestWindow(slots: { preferredDate: string; timeSlot: string }[]) {
  if (!slots.length) return ''
  const sorted = [...slots].sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
  const start = sorted[0]!.timeSlot.split('-')[0]
  const end = sorted[sorted.length - 1]!.timeSlot.split('-')[1]
  return `${start} – ${end}`
}

/* ── Submit ──────────────────────────────────────────────── */

const canSubmit = computed(() => picks.value.length > 0 && !submitting.value)

async function handleSubmit() {
  if (!canSubmit.value) return
  successMessage.value = ''
  // The API takes only slots + remarks, so the chosen subject and the
  // repeat-weekly intent ride along in the note the admin reads.
  const notes = [
    subject.value ? `Subject: ${subject.value}` : '',
    repeatWeekly.value ? 'Would like this to repeat weekly for the rest of term.' : '',
    remarks.value.trim(),
  ].filter(Boolean)

  try {
    const result = await scheduleStore.submitRequest({
      slots: picks.value.map((pick) => ({ ...pick })),
      remarks: notes.join('\n'),
    })
    const count = result.count || bookingPreview.value.length || 1
    picks.value = []
    remarks.value = ''
    successMessage.value =
      result.message ||
      (count === 1
        ? 'Class booked. An admin will assign one teacher to the full session.'
        : `${count} classes booked. An admin will assign a teacher to each.`)
    await scheduleStore.fetchMine()
  } catch {
    // store surfaces the error
  }
}

async function loadWeek() {
  await availabilityStore.fetchOpen(days.value[0]!.iso, days.value[4]!.iso)
}

function stepWeek(delta: number) {
  weekOffset.value += delta
  void loadWeek()
}

onMounted(async () => {
  await Promise.allSettled([loadWeek(), scheduleStore.fetchMine()])
})
</script>

<template>
  <section class="book">
    <p class="lede">
      Pick dates and times teachers still have open. Consecutive slots on the same day become
      <strong>one class</strong> (for example 09:30–12:00). You can book starting
      <strong>{{ LEAD_DAYS }} days from today</strong>.
    </p>

    <div class="split">
      <div class="left">
        <div class="gridbar">
          <div class="weeknav">
            <button type="button" class="step" aria-label="Previous week" @click="stepWeek(-1)">
              ‹
            </button>
            <p class="range">{{ rangeLabel }}</p>
            <button type="button" class="step" aria-label="Next week" @click="stepWeek(1)">
              ›
            </button>
          </div>

          <div class="legend" aria-hidden="true">
            <span class="key open" />Available <span class="key picked" />Your pick
            <span class="key full" />Full
          </div>
        </div>

        <div class="gridwrap">
          <div class="grid">
            <div class="gutter" />
            <div v-for="day in days" :key="day.iso" class="dayhead">
              <p class="dayname">{{ day.label }}</p>
              <p class="daynum">{{ day.dayNumber }}</p>
            </div>

            <template v-for="row in rows" :key="row.slot">
              <div class="gutter">
                <span v-if="isHourStart(row.slot)">{{ row.slot.split('-')[0] }}</span>
              </div>

              <template v-if="row.closed">
                <div v-for="day in days" :key="day.iso + row.slot" class="slot closed">
                  <span class="slot-text">closed</span>
                </div>
              </template>

              <button
                v-for="day in days"
                v-else
                :key="day.iso + row.slot"
                type="button"
                class="slot"
                :class="slotState(day.iso, row.slot, day.bookable)"
                :disabled="['closed', 'full'].includes(slotState(day.iso, row.slot, day.bookable))"
                :aria-pressed="pickIndex(day.iso, row.slot) >= 0"
                :aria-label="`${day.label} ${row.slot.split('-')[0]}`"
                @click="toggleSlot(day.iso, row.slot, day.bookable)"
              >
                <span v-if="slotLabel(day.iso, row.slot)" class="slot-text">
                  {{ slotLabel(day.iso, row.slot) }}
                </span>
              </button>
            </template>
          </div>
        </div>

        <p v-if="loadingOpen" class="gridnote">Loading open times…</p>
        <p v-else class="gridnote">
          Only times a teacher has left open are selectable. Requests need
          {{ LEAD_DAYS }} days' notice.
        </p>
      </div>

      <aside class="side">
        <div class="panel">
          <p class="eyebrow">Subject</p>
          <div class="chips">
            <button
              v-for="item in TRIAL_PROGRAMS"
              :key="item"
              type="button"
              class="chip"
              :class="{ active: subject === item }"
              @click="subject = subject === item ? '' : item"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <div class="panel">
          <p class="eyebrow">Your picks · {{ picks.length }}</p>

          <p v-if="!picks.length" class="empty">
            Nothing chosen yet. Tap an available time on the grid.
          </p>

          <ol v-else class="picks">
            <li v-for="(pick, index) in picks" :key="pick.preferredDate + pick.timeSlot">
              <span class="num">{{ index + 1 }}</span>
              <div class="pick-copy">
                <p class="pick-date">
                  {{
                    new Date(`${pick.preferredDate}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })
                  }}
                </p>
                <p class="pick-time">{{ pick.timeSlot.replace('-', ' – ') }}</p>
              </div>
              <button type="button" class="remove" @click="removePick(index)">Remove</button>
            </li>
          </ol>

          <p v-if="bookingPreview.length" class="preview">
            Will create
            {{ bookingPreview.length === 1 ? '1 class' : `${bookingPreview.length} classes` }}:
            {{ bookingPreview.join(' · ') }}
          </p>
        </div>

        <div class="panel">
          <label class="eyebrow" for="remarks">Anything we should know?</label>
          <textarea
            id="remarks"
            v-model="remarks"
            rows="4"
            placeholder="What you'd like help with, or anything that affects timing."
          />
          <label class="checkline">
            <input v-model="repeatWeekly" type="checkbox" />
            Repeat weekly for the rest of term
          </label>
        </div>

        <p v-if="successMessage" class="success" role="status">{{ successMessage }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <button type="button" class="submit" :disabled="!canSubmit" @click="handleSubmit">
          {{
            submitting
              ? 'Sending…'
              : bookingPreview.length <= 1
                ? 'Book this class'
                : `Book ${bookingPreview.length} classes`
          }}
        </button>
        <p class="subnote">You'll be notified when a teacher is assigned.</p>

        <div class="panel requests">
          <p class="eyebrow">Your bookings</p>
          <p v-if="loadingRequests" class="empty">Loading bookings…</p>
          <p v-else-if="!requests.length" class="empty">No class bookings yet.</p>
          <ul v-else class="request-list">
            <li v-for="request in requests" :key="request.id">
              <div class="request-head">
                <span class="status" :data-status="request.status">{{ request.status }}</span>
              </div>
              <p class="request-line">
                <template v-if="request.slots.length">
                  {{
                    new Date(`${request.slots[0]!.preferredDate}T00:00:00`).toLocaleDateString(
                      undefined,
                      { weekday: 'short', day: 'numeric', month: 'short' },
                    )
                  }}
                  · {{ formatRequestWindow(request.slots) }}
                </template>
                <template v-else>Class session</template>
              </p>
              <p v-if="request.assignedTeacher" class="request-meta">
                Teacher: {{ request.assignedTeacher.fullName }}
              </p>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.book {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.lede {
  max-width: 46rem;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--lh-muted);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 28px;
  align-items: start;
}

.left {
  min-width: 0;
}

.gridbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.weeknav {
  display: flex;
  align-items: center;
  gap: 9px;
}

.step {
  width: 27px;
  height: 27px;
  border: 0;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
  background: transparent;
  color: var(--lh-muted);
  font: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.step:hover {
  color: var(--lh-ink);
}

.step:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.range {
  font-size: 13px;
  font-weight: 700;
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

.key.open {
  background: color-mix(in srgb, var(--lh-accent) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 22%, transparent);
}

.key.picked {
  background: var(--lh-accent);
}

.key.full {
  background: color-mix(in srgb, var(--lh-ink) 4%, transparent);
}

.gridwrap {
  border-radius: 11px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.grid {
  display: grid;
  grid-template-columns: 60px repeat(5, 1fr);
  gap: 3px;
  padding: 3px;
  background: color-mix(in srgb, var(--lh-ink) 3%, transparent);
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
  padding: 7px 0;
  text-align: center;
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
  font-size: 16px;
  line-height: 1;
}

.slot {
  height: 34px;
  border: 0;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font: inherit;
  transition:
    background var(--lh-ease),
    box-shadow var(--lh-ease);
}

.slot.open {
  background: color-mix(in srgb, var(--lh-accent) 13%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 22%, transparent);
  cursor: pointer;
}

.slot.open:hover {
  background: color-mix(in srgb, var(--lh-accent) 22%, transparent);
}

.slot.picked {
  background: var(--lh-accent);
  cursor: pointer;
}

.slot.picked .slot-text {
  color: var(--lh-on-accent);
  font-size: 10.5px;
  font-weight: 800;
}

.slot.full {
  background: color-mix(in srgb, var(--lh-ink) 4%, transparent);
  cursor: not-allowed;
}

.slot.closed {
  background: color-mix(in srgb, var(--lh-ink) 1%, transparent);
}

.slot.closed .slot-text {
  font-size: 10px;
  color: var(--lh-ghost);
}

.slot:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.gridnote {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

/* ── Side ───────────────────────────────────────────────── */

.side {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.eyebrow {
  display: block;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chip {
  padding: 6px 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--lh-ease),
    background var(--lh-ease);
}

.chip:hover {
  color: var(--lh-ink);
}

.chip.active {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
  font-weight: 700;
}

.chip:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.picks {
  margin-top: 10px;
  list-style: none;
}

.picks li {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 0;
  border-bottom: 1px solid var(--lh-line);
}

.picks li:first-child {
  border-top: 1px solid var(--lh-line);
}

.num {
  flex: 0 0 22px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
  font-size: 10.5px;
  font-weight: 800;
}

.pick-copy {
  flex: 1;
  min-width: 0;
}

.pick-date {
  font-size: 13px;
  font-weight: 700;
}

.pick-time {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--lh-muted);
}

.remove {
  border: 0;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.remove:hover {
  color: var(--lh-danger);
}

.remove:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

textarea {
  width: 100%;
  margin-top: 10px;
  padding: 11px 12px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  resize: vertical;
}

textarea::placeholder {
  color: var(--lh-ghost);
}

textarea:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.checkline {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.checkline input {
  width: 15px;
  height: 15px;
  accent-color: var(--lh-accent);
}

.preview {
  margin-top: 12px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--lh-accent);
}

.success {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 12.5px;
}

.requests {
  margin-top: 4px;
}

.request-list {
  list-style: none;
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.request-list li {
  padding: 10px 11px;
  border-radius: var(--lh-radius-item);
  background: var(--lh-bg);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.request-head {
  margin-bottom: 4px;
}

.status {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.status[data-status='pending'] {
  color: var(--lh-warm, #c9a227);
}

.status[data-status='assigned'],
.status[data-status='confirmed'] {
  color: var(--lh-accent);
}

.request-line {
  font-size: 12.5px;
  font-weight: 600;
}

.request-meta {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--lh-muted);
}

.error {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
  font-size: 12.5px;
}

.submit {
  height: 44px;
  border: 0;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.submit:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.submit:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent-hover);
}

.subnote {
  font-size: 11.5px;
  color: var(--lh-dim);
  text-align: center;
}

.empty {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

@media (max-width: 1000px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
