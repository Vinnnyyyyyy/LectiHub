<script setup lang="ts">
/**
 * Requests (admin 03) — the full review and assign surface.
 * Queue on the left, one request in detail on the right: their remarks,
 * their preferred slots, and teachers ranked for whichever slot is targeted.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import axios from 'axios'
import { useAdminScheduleStore } from '../../stores/adminSchedule'
import type { ScheduleRequest } from '../../stores/schedule'
import { initialsFrom } from '../../utils/initials'
import { formatDate, formatDateTime, formatSlot, hoursSince } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

type Queue = 'pending' | 'past'
type Filter = 'all' | 'trials' | 'overdue'

const adminStore = useAdminScheduleStore()

const {
  requests,
  pastRequests,
  selected,
  loadingRequests,
  loadingPast,
  loadingReview,
  assigning,
  error,
} = storeToRefs(adminStore)

const queue = ref<Queue>('pending')
const filter = ref<Filter>('all')
const search = ref('')
const targetSlotId = ref<number | null>(null)
const successMessage = ref('')
const errorMessage = ref('')

const ORDINALS = ['1st choice', '2nd choice', '3rd choice']

/* ── Queue ───────────────────────────────────────────────── */

const source = computed(() => (queue.value === 'pending' ? requests.value : pastRequests.value))

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return source.value
    .filter((request) => !term || (request.student?.fullName ?? '').toLowerCase().includes(term))
    .filter((request) => {
      // The list only knows what the queue payload carries, so filters work on
      // age and source rather than per-slot availability.
      if (filter.value === 'all') return true
      if (filter.value === 'overdue') return hoursSince(request.createdAt) > 48
      return request.source === 'free_trial'
    })
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
})

usePageEyebrow(() => `${requests.value.length} awaiting review`)

function ageLabel(createdAt: string) {
  const hours = hoursSince(createdAt)
  if (!Number.isFinite(hours)) return ''
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h`
  return `${Math.round(hours / 24)}d`
}

function requestChips(request: ScheduleRequest) {
  const chips: { label: string; tone: 'accent' | 'neutral' | 'warm' }[] = []
  if (request.program) chips.push({ label: request.program, tone: 'accent' })
  if (request.source === 'free_trial') chips.push({ label: 'Free trial', tone: 'warm' })
  chips.push({
    label: `${request.slots.length} slot${request.slots.length === 1 ? '' : 's'}`,
    tone: 'neutral',
  })
  if (queue.value === 'pending' && hoursSince(request.createdAt) > 48) {
    chips.push({ label: 'Overdue', tone: 'warm' })
  }
  return chips
}

function firstPreferred(request: ScheduleRequest) {
  const slot = request.slots[0]
  if (!slot) return 'No preferred slots'
  return `${formatDate(slot.preferredDate)} · ${slot.timeSlot.split('-')[0]} preferred`
}

async function open(id: number) {
  successMessage.value = ''
  errorMessage.value = ''
  try {
    await adminStore.fetchRequestReview(id)
  } catch {
    // store surfaces the error
  }
}

/* ── Detail ──────────────────────────────────────────────── */

// Default the target to the first preferred slot whenever a request opens.
watch(
  () => selected.value?.request.id,
  () => {
    successMessage.value = ''
    errorMessage.value = ''
    targetSlotId.value = selected.value?.slotAvailability[0]?.id ?? null
  },
)

const targetSlot = computed(
  () =>
    selected.value?.slotAvailability.find((slot) => slot.id === targetSlotId.value) ??
    selected.value?.slotAvailability[0] ??
    null,
)

/** Candidates ranked for the targeted slot: free ones first, then by fit. */
const candidates = computed(() => {
  if (!selected.value) return []
  const freeIds = new Set((targetSlot.value?.availableTeachers ?? []).map((t) => t.id))

  return selected.value.teacherCandidates
    .map((candidate) => ({
      ...candidate,
      freeForTarget: freeIds.has(candidate.id),
      conflict: (targetSlot.value?.unavailableTeachers ?? []).find((t) => t.id === candidate.id)
        ?.conflict,
    }))
    .sort((a, b) => {
      if (a.freeForTarget !== b.freeForTarget) return a.freeForTarget ? -1 : 1
      return b.suitabilityScore - a.suitabilityScore
    })
})

const isPending = computed(() => selected.value?.request.status === 'pending')

async function assign(teacherId: number) {
  if (!selected.value) return
  successMessage.value = ''
  errorMessage.value = ''
  try {
    const result = await adminStore.assignTeacher(
      selected.value.request.id,
      teacherId,
      targetSlot.value?.id ?? null,
    )
    const calendarNote = result.calendarSync ? ' Calendars updated.' : ''
    const emailNote = result.emails?.enabled ? ' Confirmation emails sent.' : ''
    successMessage.value =
      (result.message || `Assigned ${result.request.assignedTeacher?.fullName || 'teacher'}.`) +
      calendarNote +
      emailNote
    queue.value = 'past'
    await adminStore.fetchReviewLists()
  } catch (err) {
    errorMessage.value = axios.isAxiosError(err)
      ? err.response?.data?.message || 'Could not assign teacher'
      : 'Could not assign teacher'
  }
}

onMounted(() => {
  if (!requests.value.length && !pastRequests.value.length) void adminStore.fetchReviewLists()
})
</script>

<template>
  <section class="requests">
    <!-- Queue -->
    <aside class="queue">
      <div class="queue-head">
        <div class="tabs">
          <button
            type="button"
            class="tab"
            :class="{ active: queue === 'pending' }"
            @click="queue = 'pending'"
          >
            Pending <span class="count">{{ requests.length }}</span>
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: queue === 'past' }"
            @click="queue = 'past'"
          >
            Reviewed <span class="count">{{ pastRequests.length }}</span>
          </button>
        </div>

        <label class="search">
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input v-model="search" type="search" placeholder="Search students" />
        </label>

        <div class="filters">
          <button
            v-for="item in ['all', 'trials', 'overdue'] as Filter[]"
            :key="item"
            type="button"
            class="pill"
            :class="{ active: filter === item }"
            @click="filter = item"
          >
            {{ item === 'all' ? 'All' : item === 'trials' ? 'Trials' : 'Overdue' }}
          </button>
        </div>
      </div>

      <div class="queue-list">
        <p v-if="loadingRequests || loadingPast" class="queue-empty">Loading…</p>
        <p v-else-if="!visible.length" class="queue-empty">
          {{ queue === 'pending' ? 'Nothing waiting. The queue is clear.' : 'No past reviews.' }}
        </p>

        <button
          v-for="request in visible"
          v-else
          :key="request.id"
          type="button"
          class="qcard"
          :class="{ active: selected?.request.id === request.id }"
          @click="open(request.id)"
        >
          <span class="qhead">
            <span class="qavatar" aria-hidden="true">
              {{ initialsFrom(request.student?.fullName || 'Student') }}
            </span>
            <span class="qname">{{ request.student?.fullName ?? 'Student' }}</span>
            <span class="qage">{{ ageLabel(request.createdAt) }}</span>
          </span>

          <span class="qchips">
            <span
              v-for="chip in requestChips(request)"
              :key="chip.label"
              class="chip"
              :class="chip.tone"
            >
              {{ chip.label }}
            </span>
          </span>

          <span class="qwhen">{{ firstPreferred(request) }}</span>
        </button>
      </div>
    </aside>

    <!-- Detail -->
    <div class="detail">
      <p v-if="loadingReview" class="state">Loading request…</p>

      <div v-else-if="!selected" class="state empty">
        <p class="empty-title">Select a request</p>
        <p class="empty-copy">
          Pick a booking from the queue to see their preferred times and who is free.
        </p>
      </div>

      <template v-else>
        <div class="dhead">
          <span class="davatar" aria-hidden="true">
            {{ initialsFrom(selected.request.student?.fullName || 'Student') }}
          </span>
          <div class="dhead-copy">
            <div class="dhead-title">
              <p class="dname">{{ selected.request.student?.fullName ?? 'Student' }}</p>
              <span class="chip" :class="isPending ? 'warm' : 'accent'">
                {{ selected.request.status }}
              </span>
            </div>
            <p class="dmeta">
              {{ selected.request.student?.email || selected.request.student?.username }} ·
              submitted {{ formatDateTime(selected.request.createdAt) }}
            </p>
          </div>
        </div>

        <p v-if="successMessage" class="banner" role="status">{{ successMessage }}</p>
        <p v-if="errorMessage || error" class="banner error" role="alert">
          {{ errorMessage || error }}
        </p>

        <div v-if="selected.request.remarks" class="block">
          <p class="block-label">Student remarks</p>
          <p class="remarks">{{ selected.request.remarks }}</p>
        </div>

        <!-- Preferred slots -->
        <div class="block">
          <p class="block-label">Preferred slots</p>
          <div class="slots">
            <button
              v-for="(slot, index) in selected.slotAvailability"
              :key="slot.id"
              type="button"
              class="slot"
              :class="{
                target: targetSlot?.id === slot.id,
                barren: !slot.availableTeachers.length,
              }"
              :aria-pressed="targetSlot?.id === slot.id"
              @click="targetSlotId = slot.id"
            >
              <span class="slot-head">
                <span class="tick" aria-hidden="true">
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M2 5.2l2 2 4-4.4" />
                  </svg>
                </span>
                {{ ORDINALS[index] ?? `Choice ${index + 1}` }}
              </span>
              <span class="slot-date">{{ formatDate(slot.preferredDate) }}</span>
              <span class="slot-time">{{ formatSlot(slot.timeSlot) }}</span>
              <span class="slot-free">
                {{ slot.availableTeachers.length }} of
                {{ slot.availableTeachers.length + slot.unavailableTeachers.length }} teachers free
              </span>
            </button>
          </div>
        </div>

        <!-- Teacher match -->
        <div class="block">
          <div class="block-head">
            <p class="block-label">
              Teacher match<template v-if="targetSlot">
                · {{ formatDate(targetSlot.preferredDate) }},
                {{ targetSlot.timeSlot.split('-')[0] }}</template
              >
            </p>
            <p class="block-note">Ranked by availability, subject fit and workload</p>
          </div>

          <div class="table">
            <div class="trow head">
              <span>Teacher</span><span>Subject</span><span>Weekly load</span><span>Fit</span>
              <span class="tcol-action" />
            </div>

            <p v-if="!candidates.length" class="state inline">No teachers to match against.</p>

            <div
              v-for="candidate in candidates"
              v-else
              :key="candidate.id"
              class="trow"
              :class="{ favoured: candidate.freeForTarget }"
            >
              <div class="tteacher">
                <span class="tavatar" aria-hidden="true">
                  {{ initialsFrom(candidate.fullName) }}
                </span>
                <div class="tteacher-copy">
                  <p class="tname">{{ candidate.fullName }}</p>
                  <p v-if="candidate.conflict" class="treason danger">
                    Busy · {{ candidate.conflict.title || 'another class' }}
                  </p>
                  <p v-else-if="candidate.matchReasons.length" class="treason">
                    {{ candidate.matchReasons.slice(0, 2).join(' · ') }}
                  </p>
                  <p v-else class="treason">
                    Free for {{ candidate.availableSlotCount }} of
                    {{ selected.slotAvailability.length }} slots
                  </p>
                </div>
              </div>

              <p class="tcell">{{ candidate.subjectExpertise || '—' }}</p>
              <p class="tcell">{{ candidate.workload }}h</p>
              <p class="tfit" :class="{ dim: !candidate.freeForTarget }">
                {{ candidate.suitabilityScore }}
              </p>

              <div class="tcol-action">
                <button
                  v-if="isPending"
                  type="button"
                  class="assign"
                  :class="{ ghost: !candidate.freeForTarget }"
                  :disabled="assigning || !candidate.assignable"
                  @click="assign(candidate.id)"
                >
                  {{ assigning ? '…' : 'Assign' }}
                </button>
              </div>
            </div>
          </div>

          <p v-if="isPending && targetSlot" class="footnote">
            {{ targetSlot.availableTeachers.length }} teacher{{
              targetSlot.availableTeachers.length === 1 ? '' : 's'
            }}
            free for this slot. Assigning notifies
            {{ selected.request.student?.fullName?.split(' ')[0] ?? 'the student' }} and the
            teacher.
          </p>
          <p v-else-if="!isPending && selected.request.assignedTeacher" class="footnote">
            Assigned to {{ selected.request.assignedTeacher.fullName
            }}<template v-if="selected.request.assignedAt">
              on {{ formatDateTime(selected.request.assignedAt) }}</template
            >. This review is read-only.
          </p>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.requests {
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  min-width: 0;
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

/* ── Queue ──────────────────────────────────────────────── */

.queue {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--lh-line);
  background: color-mix(in srgb, var(--lh-rail) 55%, var(--lh-bg));
}

.queue-head {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--lh-line);
}

.tabs {
  display: flex;
  gap: 16px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 0 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.tab:hover {
  color: var(--lh-ink);
}

.tab.active {
  border-bottom-color: var(--lh-accent);
  color: var(--lh-accent);
  font-weight: 700;
}

.count {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  font-size: 10px;
  font-weight: 800;
}

.tab.active .count {
  background: var(--lh-accent-soft);
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 29px;
  padding: 0 10px;
  border-radius: var(--lh-radius-control);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-dim);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--lh-ink);
  font: inherit;
  font-size: 12px;
}

.search input:focus {
  outline: 0;
}

.search:focus-within {
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.filters {
  display: flex;
  gap: 5px;
}

.pill {
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.pill.active {
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  color: var(--lh-ink);
  font-weight: 700;
}

.pill:focus-visible,
.tab:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.queue-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px;
  overflow-y: auto;
}

.queue-empty {
  padding: 18px 6px;
  font-size: 12px;
  color: var(--lh-muted);
}

.qcard {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    box-shadow var(--lh-ease);
}

.qcard:hover {
  background: var(--lh-bg-elevated);
}

.qcard.active {
  background: color-mix(in srgb, var(--lh-accent) 9%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 20%, transparent);
}

.qcard:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.qhead {
  display: flex;
  align-items: center;
  gap: 9px;
}

.qavatar {
  flex: 0 0 24px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-size: 10px;
  font-weight: 800;
}

.qname {
  min-width: 0;
  font-size: 13.5px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qage {
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--lh-dim);
}

.qchips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.chip {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: capitalize;
}

.chip.accent {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.chip.warm {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.chip.neutral {
  background: color-mix(in srgb, var(--lh-ink) 6%, transparent);
  color: var(--lh-muted);
}

.qwhen {
  font-size: 11.5px;
  color: var(--lh-faint);
}

/* ── Detail ─────────────────────────────────────────────── */

.detail {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  padding: 20px 22px 26px;
}

.state {
  font-size: 12.5px;
  color: var(--lh-muted);
}

.state.inline {
  padding: 16px;
  border-top: 1px solid var(--lh-line);
}

.state.empty {
  margin: auto;
  text-align: center;
}

.empty-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  font-weight: 500;
  color: var(--lh-ink);
}

.empty-copy {
  margin-top: 8px;
  max-width: 24rem;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.dhead {
  display: flex;
  align-items: center;
  gap: 12px;
}

.davatar {
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-size: 12.5px;
  font-weight: 800;
}

.dhead-copy {
  min-width: 0;
}

.dhead-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.dname {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 21px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.dmeta {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--lh-dim);
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

.block-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}

.block-note {
  font-size: 11px;
  color: var(--lh-dim);
}

.remarks {
  margin-top: 9px;
  padding: 13px 15px;
  border-radius: var(--lh-radius-item);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lh-muted);
  text-wrap: pretty;
  white-space: pre-line;
}

.slots {
  display: flex;
  gap: 9px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.slot {
  flex: 1 1 12rem;
  display: grid;
  gap: 5px;
  padding: 11px 13px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    box-shadow var(--lh-ease);
}

.slot.target {
  background: color-mix(in srgb, var(--lh-accent) 8%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 28%, transparent);
}

.slot.barren {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-danger) 30%, transparent);
}

.slot:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.slot-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.slot.target .slot-head {
  color: var(--lh-accent);
}

.tick {
  display: grid;
  place-items: center;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--lh-ink) 10%, transparent);
  color: var(--lh-rail);
}

.slot.target .tick {
  background: var(--lh-accent);
  color: var(--lh-on-accent);
}

.slot-date {
  font-size: 13px;
  font-weight: 700;
}

.slot-time {
  font-size: 12px;
  color: var(--lh-muted);
}

.slot-free {
  font-size: 11px;
  color: var(--lh-dim);
}

.slot.barren .slot-free {
  color: var(--lh-danger);
}

/* Teacher table */

.table {
  border-radius: var(--lh-radius-item);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.trow {
  display: grid;
  grid-template-columns: 1.6fr 1fr 1.1fr 0.7fr auto;
  gap: 14px;
  align-items: center;
  padding: 11px 15px;
  border-top: 1px solid var(--lh-line);
}

.trow.head {
  padding: 9px 15px;
  border-top: 0;
  background: var(--lh-rail);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.trow.favoured {
  background: color-mix(in srgb, var(--lh-accent) 5%, transparent);
}

.tcol-action {
  width: 74px;
}

.tteacher {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tavatar {
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-size: 10px;
  font-weight: 800;
}

.tteacher-copy {
  min-width: 0;
}

.tname {
  font-size: 13px;
  font-weight: 700;
}

.treason {
  margin-top: 2px;
  font-size: 11px;
  color: var(--lh-dim);
}

.treason.danger {
  color: var(--lh-danger);
}

.tcell {
  font-size: 12.5px;
  color: var(--lh-muted);
}

.tfit {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 17px;
  font-weight: 500;
  color: var(--lh-accent);
}

.tfit.dim {
  color: var(--lh-faint);
}

.assign {
  width: 74px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.assign.ghost {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
}

.assign:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.assign:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.footnote {
  margin-top: 11px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

@media (max-width: 1100px) {
  .requests {
    grid-template-columns: 1fr;
  }

  .queue {
    border-right: 0;
    border-bottom: 1px solid var(--lh-line);
  }

  .queue-list {
    max-height: 20rem;
  }
}
</style>
