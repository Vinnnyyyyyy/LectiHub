<template>
  <div class="login-page">
    <form @submit.prevent="handleLogin">
      <h2>LectiHub Login</h2>

      <label>Username</label>
      <input v-model="username" type="text" required />

      <label>Password</label>
      <input v-model="password" type="password" required />

      <button type="submit" :disabled="loading">
        {{ loading ? 'Logging in...' : 'Login' }}
      </button>

      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const authStore = useAuthStore()
const router = useRouter()

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await authStore.login(username.value, password.value)

    if (authStore.role === 'admin') router.push('/admin')
    else if (authStore.role === 'teacher') router.push('/teacher')
    else if (authStore.role === 'student') router.push('/student')
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
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}
form {
  display: flex;
  flex-direction: column;
  width: 300px;
  gap: 8px;
}
.error {
  color: red;
}
</style>
