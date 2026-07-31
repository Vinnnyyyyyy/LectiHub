<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import AuthLayout from '../components/AuthLayout.vue'

const username = ref('')
const password = ref('')
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
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
        />
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
