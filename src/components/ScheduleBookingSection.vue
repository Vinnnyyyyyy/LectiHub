<template>
  <section class="booking" id="booking">
    <div class="booking-intro">
      <h2>Booking</h2>
      <p>
        Choose one or more preferred dates and time slots, add any remarks, then submit a request.
        An administrator will review it before a teacher is assigned.
      </p>
    </div>

    <form class="booking-form" @submit.prevent="handleSubmit">
      <div class="picker">
        <label for="preferred-date">Preferred date</label>
        <input
          id="preferred-date"
          v-model="selectedDate"
          type="date"
          :min="minDate"
          required
        />

        <p class="field-label">Time slots</p>
        <div class="slot-grid" role="group" aria-label="Time slots">
          <button
            v-for="slot in TIME_SLOTS"
            :key="slot"
            type="button"
            class="slot"
            :class="{ active: selectedTimeSlots.includes(slot) }"
            @click="toggleTimeSlot(slot)"
          >
            {{ formatSlot(slot) }}
          </button>
        </div>

        <button type="button" class="add-slot" :disabled="!canAddPreference" @click="addPreference">
          Add preference
        </button>
      </div>

      <div class="selected">
        <p class="field-label">Your preferred schedule</p>
        <ul v-if="preferences.length" class="preference-list">
          <li v-for="(item, index) in preferences" :key="`${item.preferredDate}-${item.timeSlot}`">
            <span>{{ formatDate(item.preferredDate) }} · {{ formatSlot(item.timeSlot) }}</span>
            <button type="button" class="remove" @click="removePreference(index)">Remove</button>
          </li>
        </ul>
        <p v-else class="hint">Add at least one date and time slot to continue.</p>
      </div>

      <label for="remarks">Additional remarks</label>
      <textarea
        id="remarks"
        v-model="remarks"
        rows="3"
        maxlength="500"
        placeholder="Anything an admin should know (topics, flexibility, etc.)"
      />

      <button type="submit" class="submit" :disabled="submitting || preferences.length === 0">
        {{ submitting ? 'Submitting...' : 'Submit scheduling request' }}
      </button>

      <p v-if="successMessage" class="success" role="status">{{ successMessage }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    </form>

    <div class="requests">
      <h3>Your requests</h3>
      <p v-if="loading" class="hint">Loading requests...</p>
      <p v-else-if="!requests.length" class="hint">No scheduling requests yet.</p>
      <ul v-else class="request-list">
        <li v-for="request in requests" :key="request.id">
          <div class="request-head">
            <span class="status" :data-status="request.status">{{ request.status }}</span>
            <time>{{ formatDateTime(request.createdAt) }}</time>
          </div>
          <ul class="request-slots">
            <li v-for="slot in request.slots" :key="`${request.id}-${slot.preferredDate}-${slot.timeSlot}`">
              {{ formatDate(slot.preferredDate) }} · {{ formatSlot(slot.timeSlot) }}
            </li>
          </ul>
          <p v-if="request.remarks" class="request-remarks">{{ request.remarks }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { storeToRefs } from 'pinia'
import { useScheduleStore, type ScheduleSlot } from '../stores/schedule'

const TIME_SLOTS = [
  '09:00-10:00',
  '10:00-11:00',
  '11:00-12:00',
  '13:00-14:00',
  '14:00-15:00',
  '15:00-16:00',
  '16:00-17:00',
  '17:00-18:00',
] as const

const scheduleStore = useScheduleStore()
const { requests, loading, submitting } = storeToRefs(scheduleStore)

const selectedDate = ref('')
const selectedTimeSlots = ref<string[]>([])
const preferences = ref<ScheduleSlot[]>([])
const remarks = ref('')
const errorMessage = ref('')
const successMessage = ref('')

const minDate = computed(() => new Date().toISOString().slice(0, 10))

const canAddPreference = computed(
  () => Boolean(selectedDate.value) && selectedTimeSlots.value.length > 0,
)

function toggleTimeSlot(slot: string) {
  if (selectedTimeSlots.value.includes(slot)) {
    selectedTimeSlots.value = selectedTimeSlots.value.filter((item) => item !== slot)
  } else {
    selectedTimeSlots.value = [...selectedTimeSlots.value, slot]
  }
}

function addPreference() {
  if (!canAddPreference.value) return

  const next = [...preferences.value]
  for (const timeSlot of selectedTimeSlots.value) {
    const exists = next.some(
      (item) => item.preferredDate === selectedDate.value && item.timeSlot === timeSlot,
    )
    if (!exists) {
      next.push({ preferredDate: selectedDate.value, timeSlot })
    }
  }

  next.sort((a, b) =>
    a.preferredDate === b.preferredDate
      ? a.timeSlot.localeCompare(b.timeSlot)
      : a.preferredDate.localeCompare(b.preferredDate),
  )

  preferences.value = next
  selectedTimeSlots.value = []
}

function removePreference(index: number) {
  preferences.value = preferences.value.filter((_, i) => i !== index)
}

function formatSlot(slot: string) {
  return slot.replace('-', ' – ')
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(value: string) {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!preferences.value.length) {
    errorMessage.value = 'Add at least one preferred date and time slot'
    return
  }

  try {
    await scheduleStore.submitRequest({
      slots: preferences.value,
      remarks: remarks.value.trim(),
    })
    preferences.value = []
    remarks.value = ''
    selectedDate.value = ''
    selectedTimeSlots.value = []
    successMessage.value = 'Request submitted with Pending status. An admin will review it soon.'
  } catch (err) {
    if (axios.isAxiosError(err)) {
      errorMessage.value = err.response?.data?.message || 'Could not submit schedule request'
    } else {
      errorMessage.value = 'Could not submit schedule request'
    }
  }
}

onMounted(async () => {
  try {
    await scheduleStore.fetchMine()
  } catch {
    // error already stored on the schedule store
  }
})
</script>

<style scoped>
.booking {
  margin-top: 0.25rem;
  padding: 1.35rem 1.25rem 1.4rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
  color: var(--lh-ink);
  animation: fade-up 0.5s ease both;
}

.booking-intro h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 550;
  color: var(--lh-accent);
}

.booking-intro p,
.hint,
label,
.field-label,
.preference-list,
.request-list,
textarea,
button,
.success,
.error,
time {
  font-family: 'Manrope', sans-serif;
}

.booking-intro p {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  line-height: 1.45;
  max-width: 42rem;
}

.booking-form {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.1rem;
}

.picker,
.selected,
.requests {
  padding-top: 0.35rem;
}

label,
.field-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
  color: var(--lh-muted);
}

input[type='date'],
textarea {
  width: 100%;
  max-width: 22rem;
  font: inherit;
  font-size: 0.95rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--lh-line-strong);
  border-radius: 0.7rem;
  background: var(--lh-input);
  color: var(--lh-ink);
  color-scheme: dark;
}

textarea {
  max-width: none;
  resize: vertical;
  min-height: 5.5rem;
}

textarea::placeholder {
  color: var(--lh-faint);
}

input:focus,
textarea:focus {
  outline: none;
  border-color: rgba(126, 184, 164, 0.55);
  box-shadow: 0 0 0 3px rgba(126, 184, 164, 0.12);
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.slot,
.add-slot,
.submit,
.remove {
  border: 1px solid var(--lh-line);
  border-radius: 0.65rem;
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;
}

.slot {
  padding: 0.55rem 0.65rem;
  font-size: 0.88rem;
  font-weight: 600;
}

.slot.active {
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.45);
  color: var(--lh-accent);
}

.add-slot,
.submit {
  width: fit-content;
  padding: 0.7rem 1rem;
  font-weight: 700;
}

.add-slot:hover:not(:disabled),
.submit:hover:not(:disabled),
.slot:hover,
.remove:hover {
  transform: translateY(-1px);
}

.add-slot:disabled,
.submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.submit {
  border: none;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
}

.preference-list,
.request-list,
.request-slots {
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.preference-list li,
.request-list > li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.7rem;
  background: rgba(20, 25, 31, 0.72);
}

.request-list > li {
  flex-direction: column;
  align-items: stretch;
}

.remove {
  padding: 0.35rem 0.55rem;
  font-size: 0.8rem;
  font-weight: 700;
}

.hint {
  color: var(--lh-faint);
  font-size: 0.9rem;
  font-style: italic;
}

.success {
  color: var(--lh-accent);
  font-size: 0.9rem;
  font-weight: 600;
}

.error {
  color: var(--lh-danger);
  font-size: 0.9rem;
}

.requests {
  margin-top: 1.4rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--lh-line);
}

.requests h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.15rem;
  font-weight: 550;
  color: var(--lh-accent);
  margin-bottom: 0.65rem;
}

.request-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.status {
  text-transform: capitalize;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  padding: 0.2rem 0.45rem;
  border-radius: 0.4rem;
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.status[data-status='approved'] {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.status[data-status='rejected'] {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.request-slots {
  margin-top: 0.45rem;
  font-size: 0.9rem;
  color: var(--lh-muted);
}

.request-remarks {
  margin-top: 0.35rem;
  font-size: 0.88rem;
  color: var(--lh-muted);
}

time {
  font-size: 0.8rem;
  color: var(--lh-faint);
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .preference-list li {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
