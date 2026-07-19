<template>
  <div class="auth-page">
    <div class="auth-atmosphere" aria-hidden="true" />
    <form class="auth-panel" @submit.prevent="handleLogin">
      <p class="brand">LectiHub</p>
      <h1>Welcome back</h1>
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
      error.value = err.response?.data?.message || 'Login failed'
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
  --ink: #10231f;
  --moss: #1f6b57;
  --moss-deep: #145043;
  --panel: rgba(255, 252, 247, 0.92);
  --line: rgba(16, 35, 31, 0.12);
  --danger: #a33b2b;

  position: relative;
  width: 100%;
  min-height: 100vh;
  display: grid;
  place-items: center;
  justify-items: center;
  padding: 2rem 1.25rem;
  color: var(--ink);
  overflow: hidden;
}

.auth-atmosphere {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 55% at 12% 18%, rgba(47, 140, 112, 0.28), transparent 60%),
    radial-gradient(ellipse 55% 45% at 88% 78%, rgba(196, 146, 74, 0.22), transparent 55%),
    linear-gradient(160deg, #dfece6 0%, #f7f3ea 48%, #d8e4ef 100%);
  animation: drift 14s ease-in-out infinite alternate;
}

@keyframes drift {
  from {
    transform: scale(1) translate3d(0, 0, 0);
  }
  to {
    transform: scale(1.04) translate3d(-1.5%, 1%, 0);
  }
}

.auth-panel {
  position: relative;
  width: min(100%, 26rem);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 2rem 1.75rem 1.75rem;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 1.25rem;
  backdrop-filter: blur(10px);
  box-shadow: 0 24px 60px rgba(16, 35, 31, 0.12);
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
  color: var(--moss-deep);
}

h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 550;
  line-height: 1.2;
  margin-bottom: 0.15rem;
}

.lede {
  font-family: 'Manrope', sans-serif;
  font-size: 0.95rem;
  line-height: 1.45;
  color: rgba(16, 35, 31, 0.72);
  margin-bottom: 0.65rem;
}

label {
  font-family: 'Manrope', sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  margin-top: 0.25rem;
}

input {
  font-family: 'Manrope', sans-serif;
  font-size: 0.95rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: #fffefb;
  color: var(--ink);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

input:focus {
  outline: none;
  border-color: rgba(31, 107, 87, 0.55);
  box-shadow: 0 0 0 3px rgba(31, 107, 87, 0.14);
}

button {
  margin-top: 0.65rem;
  font-family: 'Manrope', sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  padding: 0.8rem 1rem;
  border: none;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, var(--moss) 0%, var(--moss-deep) 100%);
  color: #f7fffb;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    filter 0.18s ease;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.error {
  font-family: 'Manrope', sans-serif;
  color: var(--danger);
  font-size: 0.88rem;
}

.switch {
  font-family: 'Manrope', sans-serif;
  font-size: 0.9rem;
  margin-top: 0.4rem;
  color: rgba(16, 35, 31, 0.72);
}

.switch a {
  color: var(--moss-deep);
  font-weight: 700;
  text-decoration: none;
}

.switch a:hover {
  text-decoration: underline;
}
</style>
