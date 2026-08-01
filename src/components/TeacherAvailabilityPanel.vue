<template>
  <section class="panel">
    <div class="section-head">
      <h2>My weekly availability</h2>
    </div>
    <p class="subtitle">
      Students can only prefer dates and times you mark open here (and that are not already booked).
    </p>

    <p v-if="loadingMine" class="hint">Loading availability...</p>
    <template v-else>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th v-for="day in weekdays" :key="day.value">{{ day.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="slot in timeSlots" :key="slot">
              <th scope="row">{{ formatSlot(slot) }}</th>
              <td v-for="day in weekdays" :key="`${day.value}-${slot}`">
                <button
                  type="button"
                  class="toggle"
                  :class="{ open: isOpen(day.value, slot) }"
                  :aria-pressed="isOpen(day.value, slot)"
                  @click="toggle(day.value, slot)"
                >
                  {{ isOpen(day.value, slot) ? 'Open' : 'Off' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <button type="button" class="save" :disabled="savingMine" @click="save">
        {{ savingMine ? 'Saving...' : 'Save availability' }}
      </button>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { TIME_SLOTS } from '../constants/timeSlots'
import { useAvailabilityStore, type WeeklyAvailabilitySlot } from '../stores/availability'

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const availabilityStore = useAvailabilityStore()
const { mySlots, loadingMine, savingMine, error, timeSlots: storeTimeSlots } =
  storeToRefs(availabilityStore)

const draft = ref<WeeklyAvailabilitySlot[]>([])
const message = ref('')
/** Prefer API slot grid (respects admin slot length); fall back to 30-min defaults. */
const timeSlots = computed(() =>
  storeTimeSlots.value?.length ? storeTimeSlots.value : [...TIME_SLOTS],
)

function formatSlot(slot: string) {
  return slot.replace('-', ' – ')
}

function isOpen(weekday: number, timeSlot: string) {
  return draft.value.some(
    (item) => item.weekday === weekday && item.timeSlot === timeSlot && item.isOpen,
  )
}

function toggle(weekday: number, timeSlot: string) {
  const index = draft.value.findIndex(
    (item) => item.weekday === weekday && item.timeSlot === timeSlot,
  )
  if (index >= 0) {
    draft.value[index] = {
      ...draft.value[index],
      isOpen: !draft.value[index].isOpen,
    }
    return
  }
  draft.value.push({ weekday, timeSlot, isOpen: true })
}

async function save() {
  message.value = ''
  const slots: WeeklyAvailabilitySlot[] = []
  for (const day of weekdays) {
    for (const slot of timeSlots.value) {
      slots.push({
        weekday: day.value,
        timeSlot: slot,
        isOpen: isOpen(day.value, slot),
      })
    }
  }
  try {
    await availabilityStore.saveMine(slots)
    draft.value = availabilityStore.mySlots.map((item) => ({ ...item }))
    message.value = 'Availability saved. Students will see these open times.'
  } catch {
    // error on store
  }
}

onMounted(async () => {
  try {
    await availabilityStore.fetchMine()
    draft.value = availabilityStore.mySlots.map((item) => ({ ...item }))
  } catch {
    // store error
  }
})
</script>

<style scoped>
.panel {
  padding: 1.2rem 1.15rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
}

.section-head h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

.subtitle,
.hint,
.success,
.error,
button,
th,
td {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.9rem;
}

.hint {
  margin-top: 0.85rem;
  color: var(--lh-faint);
  font-style: italic;
}

.table-wrap {
  margin-top: 0.9rem;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 36rem;
}

th,
td {
  border: 1px solid var(--lh-line);
  padding: 0.35rem;
  text-align: center;
  font-size: 0.8rem;
}

th {
  color: var(--lh-muted);
  font-weight: 700;
  background: rgba(20, 25, 31, 0.7);
}

th[scope='row'] {
  text-align: left;
  white-space: nowrap;
  color: var(--lh-ink);
}

.toggle {
  width: 100%;
  border: 1px solid var(--lh-line);
  border-radius: 0.45rem;
  background: var(--lh-panel-solid);
  color: var(--lh-faint);
  padding: 0.35rem 0.4rem;
  cursor: pointer;
  font-weight: 700;
}

.toggle.open {
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.45);
  color: var(--lh-accent);
}

.save {
  margin-top: 0.85rem;
  border: none;
  border-radius: 0.65rem;
  padding: 0.7rem 1rem;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
}

.save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.success {
  margin-top: 0.55rem;
  color: var(--lh-accent);
  font-weight: 600;
}

.error {
  margin-top: 0.55rem;
  color: var(--lh-danger);
}
</style>
