<template>
  <section class="pw-panel">
    <form class="pw-form" @submit.prevent="handleSubmit">
      <p class="kicker">Account</p>
      <h2>Change password</h2>
      <p class="lede">Use a password only you know. You’ll stay signed in on this device.</p>

      <label for="current-password">
        Current password
        <div class="password-field">
          <input
            id="current-password"
            v-model="currentPassword"
            :type="showCurrent ? 'text' : 'password'"
            required
            autocomplete="current-password"
          />
          <button
            type="button"
            class="password-toggle"
            :aria-label="showCurrent ? 'Hide current password' : 'Show current password'"
            :aria-pressed="showCurrent"
            @click="showCurrent = !showCurrent"
          >
            <EyeIcon :off="showCurrent" />
          </button>
        </div>
      </label>

      <label for="new-password">
        New password
        <div class="password-field">
          <input
            id="new-password"
            v-model="newPassword"
            :type="showNew ? 'text' : 'password'"
            required
            minlength="6"
            maxlength="80"
            autocomplete="new-password"
          />
          <button
            type="button"
            class="password-toggle"
            :aria-label="showNew ? 'Hide new password' : 'Show new password'"
            :aria-pressed="showNew"
            @click="showNew = !showNew"
          >
            <EyeIcon :off="showNew" />
          </button>
        </div>
      </label>

      <label for="confirm-password">
        Confirm new password
        <div class="password-field">
          <input
            id="confirm-password"
            v-model="confirmPassword"
            :type="showConfirm ? 'text' : 'password'"
            required
            minlength="6"
            maxlength="80"
            autocomplete="new-password"
          />
          <button
            type="button"
            class="password-toggle"
            :aria-label="showConfirm ? 'Hide confirm password' : 'Show confirm password'"
            :aria-pressed="showConfirm"
            @click="showConfirm = !showConfirm"
          >
            <EyeIcon :off="showConfirm" />
          </button>
        </div>
      </label>

      <button type="submit" class="submit" :disabled="saving">
        {{ saving ? 'Updating…' : 'Update password' }}
      </button>

      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { defineComponent, h, ref } from 'vue'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const EyeIcon = defineComponent({
  name: 'EyeIcon',
  props: { off: { type: Boolean, default: false } },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 18,
          height: 18,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.8,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': 'true',
        },
        props.off
          ? [
              h('path', { d: 'M3 3l18 18' }),
              h('path', { d: 'M10.6 10.6a2.5 2.5 0 003.5 3.5' }),
              h('path', {
                d: 'M9.4 5.5A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a18.4 18.4 0 01-4.2 4.8',
              }),
              h('path', {
                d: 'M6.1 6.1A18.2 18.2 0 002 12s3.5 7 10 7a10.3 10.3 0 004.2-.9',
              }),
            ]
          : [
              h('path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' }),
              h('circle', { cx: 12, cy: 12, r: 3 }),
            ],
      )
  },
})

const authStore = useAuthStore()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')

async function handleSubmit() {
  error.value = ''
  message.value = ''

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'New password and confirmation do not match.'
    return
  }
  if (newPassword.value.length < 6) {
    error.value = 'New password must be at least 6 characters.'
    return
  }

  saving.value = true
  try {
    message.value = await authStore.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err) {
    if (axios.isAxiosError(err)) {
      error.value = err.response?.data?.message || 'Could not update password.'
    } else {
      error.value = 'Could not update password.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.pw-panel,
.kicker,
.lede,
label,
input,
button,
.success,
.error,
p,
h2 {
  font-family: 'Manrope', sans-serif;
}

.pw-panel {
  max-width: 28rem;
}

.pw-form {
  display: grid;
  gap: 0.85rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  background: var(--lh-panel);
  padding: 1.15rem 1.15rem 1.25rem;
}

.kicker {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

h2 {
  margin: 0.15rem 0 0;
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  font-size: 1.35rem;
  color: var(--lh-ink);
}

.lede {
  margin: 0;
  color: var(--lh-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--lh-muted);
}

.password-field {
  position: relative;
}

input {
  width: 100%;
  border-radius: 0.65rem;
  border: 1px solid var(--lh-line-strong);
  background: var(--lh-input);
  color: var(--lh-ink);
  padding: 0.65rem 2.75rem 0.65rem 0.75rem;
  font: inherit;
  color-scheme: dark;
}

input:focus {
  outline: 0;
  border-color: var(--lh-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lh-accent) 16%, transparent);
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--lh-muted);
  cursor: pointer;
}

.password-toggle:hover {
  color: var(--lh-ink);
  background: color-mix(in srgb, var(--lh-ink) 6%, transparent);
}

.submit {
  margin-top: 0.25rem;
  border: 0;
  border-radius: 0.7rem;
  padding: 0.75rem 1rem;
  font-weight: 750;
  cursor: pointer;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
}

.submit:disabled {
  opacity: 0.55;
  cursor: wait;
}

.success {
  margin: 0;
  color: var(--lh-accent);
  font-size: 0.9rem;
}

.error {
  margin: 0;
  color: var(--lh-danger);
  font-size: 0.9rem;
}
</style>
