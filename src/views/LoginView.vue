<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import AuthLayout from '../components/AuthLayout.vue'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const keepSignedIn = ref(true)
const error = ref('')
const loading = ref(false)

const authStore = useAuthStore()
const router = useRouter()

function redirectForRole(role: string | null) {
  if (role === 'admin') return router.push('/admin')
  if (role === 'teacher') return router.push('/teacher')
  return router.push('/student')
}

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await authStore.login(username.value.trim(), password.value)
    await redirectForRole(authStore.role)
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        error.value = 'Cannot reach the LectiHub API. Make sure the backend server is running.'
      } else {
        error.value = err.response.data?.message || 'Login failed'
      }
    } else {
      error.value = 'Login failed'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout center-name="Learning center">
    <h1>Welcome back</h1>
    <p class="lede">Sign in to see your week.</p>

    <form @submit.prevent="handleLogin">
      <div class="field">
        <label for="username">Username</label>
        <input id="username" v-model="username" type="text" required autocomplete="username" />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <div class="password-field">
          <input
            id="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            autocomplete="current-password"
          />
          <button
            type="button"
            class="password-toggle"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <svg
              v-if="!showPassword"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2.5 2.5 0 003.5 3.5" />
              <path d="M9.4 5.5A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a18.4 18.4 0 01-4.2 4.8" />
              <path d="M6.1 6.1A18.2 18.2 0 002 12s3.5 7 10 7a10.3 10.3 0 004.2-.9" />
            </svg>
          </button>
        </div>
      </div>

      <label class="checkline">
        <input v-model="keepSignedIn" type="checkbox" />
        Keep me signed in on this device
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button type="submit" class="submit" :disabled="loading">
        {{ loading ? 'Signing in…' : 'Log in' }}
      </button>
    </form>

    <p class="switch">New student? <RouterLink to="/register">Create an account</RouterLink></p>
    <p class="switch trial">
      Want a taste first? <RouterLink to="/free-trial">Book a free 30-minute trial</RouterLink>
    </p>
    <p class="note">
      Teachers and admins are given accounts by the center. Ask your coordinator if you can't get
      in.
    </p>

    <template #aside>
      <p class="eyebrow">Your week, in one place</p>
      <h2 class="side-title">Classes, reports and feedback —<br />all where you left them.</h2>

      <ul class="points">
        <li>
          <span class="marker" aria-hidden="true" />
          <div>
            <p class="point-title">Book around your teachers</p>
            <p class="point-copy">Pick from the times they've left open, up to three choices.</p>
          </div>
        </li>
        <li>
          <span class="marker" aria-hidden="true" />
          <div>
            <p class="point-title">Join in one tap</p>
            <p class="point-copy">Meeting links land on the class, with reminders before it.</p>
          </div>
        </li>
        <li>
          <span class="marker" aria-hidden="true" />
          <div>
            <p class="point-title">See how it went</p>
            <p class="point-copy">Your teacher files a report; you say how the session felt.</p>
          </div>
        </li>
      </ul>
    </template>
  </AuthLayout>
</template>

<style scoped>
.trial {
  margin-top: 7px;
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
  animation: point-in 0.5s ease both;
}

.points li:nth-child(1) {
  animation-delay: 0.32s;
}
.points li:nth-child(2) {
  animation-delay: 0.42s;
}
.points li:nth-child(3) {
  animation-delay: 0.52s;
}

@keyframes point-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.marker {
  flex: 0 0 6px;
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--lh-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--lh-accent) 14%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .points li {
    animation: none;
  }
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
