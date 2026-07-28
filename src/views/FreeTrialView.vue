<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import api from '../api/axios'
import AuthLayout from '../components/AuthLayout.vue'
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

const minDate = computed(() => {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
        error.value = 'Cannot reach the LectiHub API. Make sure the backend server is running.'
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

<template>
  <AuthLayout center-name="Learning center">
    <template v-if="!submitted">
      <p class="step">No account needed</p>
      <h1>Free 30-minute trial</h1>
      <p class="lede">Tell us when suits you. We'll confirm your session by email.</p>

      <form @submit.prevent="handleSubmit">
        <div class="field">
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
        </div>

        <div class="field">
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
        </div>

        <div class="field">
          <div class="field-head">
            <label for="trial-phone">Phone</label>
            <span class="optional">Optional</span>
          </div>
          <input
            id="trial-phone"
            v-model="phone"
            type="tel"
            maxlength="40"
            autocomplete="tel"
            placeholder="+1 555 123 4567"
          />
        </div>

        <div class="field">
          <label>Booking for</label>
          <div class="choices" role="radiogroup" aria-label="Company or Individual">
            <label
              v-for="option in TRIAL_ENTITY_OPTIONS"
              :key="option.value"
              class="choice"
              :class="{ selected: entityType === option.value }"
            >
              <input
                v-model="entityType"
                type="radio"
                name="entityType"
                :value="option.value"
                required
              />
              {{ option.label }}
            </label>
          </div>
        </div>

        <div class="field">
          <label for="trial-program">Program</label>
          <select id="trial-program" v-model="program" required>
            <option disabled value="">Select a program</option>
            <option v-for="item in TRIAL_PROGRAMS" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>

        <div class="pair">
          <div class="field">
            <label for="trial-date">Preferred date</label>
            <input id="trial-date" v-model="preferredDate" type="date" required :min="minDate" />
          </div>
          <div class="field">
            <label for="trial-slot">Time slot</label>
            <select id="trial-slot" v-model="preferredSlot" required>
              <option disabled value="">Select a slot</option>
              <option v-for="slot in TRIAL_TIME_SLOTS" :key="slot" :value="slot">{{ slot }}</option>
            </select>
          </div>
        </div>

        <div class="field">
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
        </div>

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <button type="submit" class="submit" :disabled="loading">
          {{ loading ? 'Sending…' : 'Request free trial' }}
        </button>
      </form>

      <p class="switch">Already have an account? <RouterLink to="/login">Log in</RouterLink></p>
    </template>

    <template v-else>
      <p class="step">Request sent</p>
      <h1>Thanks, {{ submittedName }}</h1>
      <p class="lede">
        We've queued your {{ submittedSlot }} session. You'll get an email once a teacher is
        confirmed.
      </p>
      <p class="switch"><RouterLink to="/login">Back to log in</RouterLink></p>
    </template>

    <template #aside>
      <p class="eyebrow">What a trial looks like</p>
      <h2 class="side-title">One lesson.<br />No commitment.</h2>

      <ul class="points">
        <li>
          <span class="marker" aria-hidden="true" />
          <div>
            <p class="point-title">30 minutes, one to one</p>
            <p class="point-copy">A real lesson with a teacher matched to your program.</p>
          </div>
        </li>
        <li>
          <span class="marker" aria-hidden="true" />
          <div>
            <p class="point-title">We confirm by email</p>
            <p class="point-copy">With the teacher, the time and a meeting link.</p>
          </div>
        </li>
        <li>
          <span class="marker" aria-hidden="true" />
          <div>
            <p class="point-title">A written report after</p>
            <p class="point-copy">What was covered and where to go next — yours to keep.</p>
          </div>
        </li>
      </ul>
    </template>
  </AuthLayout>
</template>

<style scoped>
.step {
  margin-bottom: 10px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.optional {
  font-size: 10px;
  font-weight: 700;
  color: var(--lh-ghost);
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.choices {
  display: flex;
  gap: 7px;
}

.choice {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 13px;
  border-radius: var(--lh-radius-control);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font-size: 13px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  cursor: pointer;
  transition:
    color var(--lh-ease),
    box-shadow var(--lh-ease);
}

.choice.selected {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
}

.choice input {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  height: 14px;
  padding: 0;
  accent-color: var(--lh-accent);
  box-shadow: none;
}

.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.side-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 30px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.25;
}

.points {
  display: flex;
  flex-direction: column;
  gap: 18px;
  list-style: none;
}

.points li {
  display: flex;
  gap: 12px;
}

.marker {
  flex: 0 0 6px;
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--lh-accent);
}

.point-title {
  font-size: 13.5px;
  font-weight: 700;
}

.point-copy {
  margin-top: 3px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--lh-muted);
}
</style>
