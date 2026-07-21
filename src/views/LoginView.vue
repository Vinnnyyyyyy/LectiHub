<template>
  <div class="auth-page">
    <div class="auth-atmosphere" aria-hidden="true" />
    <form class="auth-panel" @submit.prevent="handleLogin">
      <p class="brand">LectiHub</p>
      <h1>Welcome</h1>
      <p class="lede">Log in with your registered credentials to open your dashboard.</p>

      <label for="username">Username</label>
      <input id="username" v-model="username" type="text" required autocomplete="username" />

      <label for="password">Password</label>
      <input
        id="password"
        v-model="password"
        type="password"
        required
        autocomplete="current-password"
      />

      <button type="submit" :disabled="loading">
        {{ loading ? 'Logging in...' : 'Log in' }}
      </button>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <p class="switch">
        New student?
        <RouterLink to="/register">Create an account</RouterLink>
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const username = ref('')
const password = ref('')
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
        error.value =
          'Cannot reach the LectiHub API. Make sure the server is running on port 3000.'
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

<style scoped>
.auth-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: grid;
  place-items: center;
  justify-items: center;
  padding: 2rem 1.25rem;
  color: var(--lh-ink);
  overflow: hidden;
}

.auth-atmosphere {
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

.auth-panel {
  position: relative;
  width: min(100%, 26rem);
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
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.65rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--lh-accent);
}

h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 550;
  line-height: 1.2;
  margin-bottom: 0.15rem;
  color: var(--lh-ink);
}

.lede {
  font-family: 'Manrope', sans-serif;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--lh-muted);
  margin-bottom: 0.65rem;
}

label {
  font-family: 'Manrope', sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  margin-top: 0.25rem;
  color: var(--lh-muted);
}

input {
  font-family: 'Manrope', sans-serif;
  font-size: 0.95rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--lh-line-strong);
  border-radius: 0.7rem;
  background: var(--lh-input);
  color: var(--lh-ink);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

input::placeholder {
  color: var(--lh-faint);
}

input:focus {
  outline: none;
  border-color: rgba(126, 184, 164, 0.55);
  box-shadow: 0 0 0 3px rgba(126, 184, 164, 0.12);
}

button {
  margin-top: 0.65rem;
  font-family: 'Manrope', sans-serif;
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
  font-family: 'Manrope', sans-serif;
  color: var(--lh-danger);
  font-size: 0.88rem;
}

.switch {
  font-family: 'Manrope', sans-serif;
  font-size: 0.9rem;
  margin-top: 0.4rem;
  color: var(--lh-muted);
}

.switch a {
  color: var(--lh-accent);
  font-weight: 700;
  text-decoration: none;
}

.switch a:hover {
  text-decoration: underline;
}
</style>
