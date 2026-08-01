<template>
  <div class="trial-page">
    <div class="trial-atmosphere" aria-hidden="true" />

    <form v-if="!submitted" class="trial-panel" @submit.prevent="handleSubmit">
      <p class="brand">LectiHub</p>
      <h1>Free {{ durationMinutes }}‑minute trial</h1>
      <p class="lede">
        Fill in your details and preferred slot. We’ll send it to Dolibarr and queue it in LectiHub’s
        scheduler for confirmation.
      </p>

      <label for="trial-name">Name</label>
      <input
        id="trial-name"
        v-model="name"
        type="text"
        required
        maxlength="120"
        autocomplete="name"
        placeholder="Alex Rivera"
      />

      <label for="trial-email">Email</label>
      <input
        id="trial-email"
        v-model="email"
        type="email"
        required
        maxlength="180"
        autocomplete="email"
        placeholder="alex@email.com"
      />

      <label for="trial-phone">Phone <span class="optional">(optional)</span></label>
      <input
        id="trial-phone"
        v-model="phone"
        type="tel"
        maxlength="40"
        autocomplete="tel"
        placeholder="+1 555 123 4567"
      />

      <fieldset class="entity-field">
        <legend>Company / Individual</legend>
        <div class="entity-options" role="radiogroup" aria-label="Company or Individual">
          <label
            v-for="option in TRIAL_ENTITY_OPTIONS"
            :key="option.value"
            class="entity-option"
            :class="{ selected: entityType === option.value }"
          >
            <input
              v-model="entityType"
              type="radio"
              name="entityType"
              :value="option.value"
              required
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </fieldset>

      <label for="trial-program">Program</label>
      <select id="trial-program" v-model="program" required>
        <option disabled value="">Select a program</option>
        <option v-for="item in TRIAL_PROGRAMS" :key="item" :value="item">
          {{ item }}
        </option>
      </select>

      <div class="slot-row">
        <label for="trial-date">
          Preferred date
          <input id="trial-date" v-model="preferredDate" type="date" required :min="minDate" />
        </label>
        <label for="trial-slot">
          Time slot ({{ durationMinutes }} mins)
          <select id="trial-slot" v-model="preferredSlot" required>
            <option disabled value="">Select a slot</option>
            <option v-for="slot in timeSlots" :key="slot" :value="slot">
              {{ slot }}
            </option>
          </select>
        </label>
      </div>

      <label for="trial-platform">Preferred video platform</label>
      <select id="trial-platform" v-model="videoPlatform" required>
        <option disabled value="">Select a platform</option>
        <option
          v-for="option in TRIAL_VIDEO_PLATFORM_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>

      <button type="submit" :disabled="loading">
        {{ loading ? 'Sending to Dolibarr…' : 'Request free trial' }}
      </button>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <p class="switch">
        Already have an account?
        <RouterLink to="/login">Log in</RouterLink>
      </p>
    </form>

    <div v-else class="trial-panel success-panel" role="status">
      <p class="brand">LectiHub</p>
      <p class="success-kicker">Request sent</p>
      <h1>Thanks, {{ submittedName }}</h1>
      <p class="lede">
        Your request was sent to Dolibarr and queued in the E-Scheduler. We’ll confirm your
        {{ submittedSlot }} session by email.
      </p>
      <RouterLink class="back-link" to="/login">Back to log in</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import api from '../api/axios'
import { TIME_SLOTS } from '../constants/timeSlots'
import {
  TRIAL_ENTITY_OPTIONS,
  TRIAL_PROGRAMS,
  TRIAL_TIME_SLOTS,
  TRIAL_VIDEO_PLATFORM_OPTIONS,
  type TrialEntityType,
  type TrialVideoPlatform,
} from '../constants/trialForm'

const name = ref('')
const email = ref('')
const phone = ref('')
const entityType = ref<TrialEntityType>('individual')
const program = ref('')
const preferredDate = ref('')
const preferredSlot = ref('')
const videoPlatform = ref<TrialVideoPlatform | ''>('')
const loading = ref(false)
const error = ref('')
const submitted = ref(false)
const submittedName = ref('')
const submittedSlot = ref('')
const durationMinutes = ref(30)
const timeSlots = ref<string[]>([...TRIAL_TIME_SLOTS])

const minDate = computed(() => {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
})

onMounted(async () => {
  try {
    const res = await api.get<{
      timeSlots?: string[]
      durationMinutes?: number
    }>('/trial-requests/config')
    if (res.data.timeSlots?.length) {
      timeSlots.value = res.data.timeSlots
    } else {
      timeSlots.value = [...TIME_SLOTS]
    }
    if (res.data.durationMinutes === 30 || res.data.durationMinutes === 60) {
      durationMinutes.value = res.data.durationMinutes
    }
  } catch {
    // Keep built-in fallbacks if config cannot load.
  }
})

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    await api.post('/trial-requests', {
      name: name.value.trim(),
      email: email.value.trim(),
      phone: phone.value.trim() || undefined,
      entityType: entityType.value,
      program: program.value,
      preferredDate: preferredDate.value,
      preferredSlot: preferredSlot.value,
      videoPlatform: videoPlatform.value,
    })
    submittedName.value = name.value.trim()
    submittedSlot.value = `${preferredDate.value} · ${preferredSlot.value}`
    submitted.value = true
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        error.value =
          'Cannot reach the LectiHub API. Make sure the server is running on port 3000.'
      } else {
        error.value = err.response.data?.message || 'Could not submit free trial request'
      }
    } else {
      error.value = 'Could not submit free trial request'
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.trial-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem 1.25rem;
  color: var(--lh-ink);
  overflow: hidden;
}

.trial-atmosphere {
  position: absolute;
  inset: 0;
  background: var(--lh-atmosphere);
  animation: drift 16s ease-in-out infinite alternate;
}

@keyframes drift {
  from {
    transform: scale(1) translate3d(0, 0, 0);
  }
  to {
    transform: scale(1.03) translate3d(-1%, 0.8%, 0);
  }
}

.trial-panel {
  position: relative;
  width: min(100%, 32rem);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 2rem 1.75rem 1.75rem;
  background: var(--lh-panel);
  border: 1px solid var(--lh-line);
  border-radius: 1.25rem;
  backdrop-filter: blur(14px);
  box-shadow: var(--lh-shadow);
  animation: rise 0.55s ease both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.brand {
  margin: 0;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--lh-accent);
}

h1 {
  margin: 0;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 550;
  line-height: 1.2;
  color: var(--lh-ink);
}

.lede,
label,
legend,
input,
select,
button,
.error,
.switch,
.success-kicker,
.back-link,
.entity-option,
.optional {
  font-family: 'Manrope', sans-serif;
}

.optional {
  font-weight: 500;
  color: var(--lh-faint);
}

.lede {
  margin: 0 0 0.55rem;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--lh-muted);
}

label,
legend {
  font-size: 0.82rem;
  font-weight: 600;
  margin-top: 0.2rem;
  color: var(--lh-muted);
}

.entity-field {
  margin: 0.1rem 0 0;
  padding: 0;
  border: 0;
}

.entity-field legend {
  padding: 0;
  margin-bottom: 0.4rem;
}

.entity-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
}

.entity-option {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.7rem 0.8rem;
  border-radius: 0.7rem;
  border: 1px solid var(--lh-line-strong);
  background: var(--lh-input);
  color: var(--lh-ink);
  font-size: 0.92rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.entity-option.selected {
  border-color: rgba(126, 184, 164, 0.55);
  background: var(--lh-accent-soft);
}

.entity-option input {
  accent-color: var(--lh-accent-deep);
  width: auto;
  margin: 0;
  padding: 0;
  box-shadow: none;
}

.slot-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
}

.slot-row label {
  display: grid;
  gap: 0.35rem;
}

input,
select {
  width: 100%;
  font-size: 0.95rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--lh-line-strong);
  border-radius: 0.7rem;
  background: var(--lh-input);
  color: var(--lh-ink);
  color-scheme: dark;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

input:focus,
select:focus {
  outline: none;
  border-color: rgba(126, 184, 164, 0.55);
  box-shadow: 0 0 0 3px rgba(126, 184, 164, 0.12);
}

button {
  margin-top: 0.65rem;
  font-size: 0.95rem;
  font-weight: 700;
  padding: 0.8rem 1rem;
  border: none;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    filter 0.18s ease;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.error {
  margin: 0.15rem 0 0;
  color: var(--lh-danger);
  font-size: 0.88rem;
}

.switch {
  font-size: 0.9rem;
  margin: 0.35rem 0 0;
  color: var(--lh-muted);
}

.switch a,
.back-link {
  color: var(--lh-accent);
  font-weight: 700;
  text-decoration: none;
}

.switch a:hover,
.back-link:hover {
  text-decoration: underline;
}

.success-kicker {
  margin: 0.15rem 0 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.success-panel .lede {
  margin-top: 0.35rem;
}

.back-link {
  margin-top: 0.75rem;
  width: fit-content;
}

@media (max-width: 560px) {
  .slot-row,
  .entity-options {
    grid-template-columns: 1fr;
  }
}
</style>
