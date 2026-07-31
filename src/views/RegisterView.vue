<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import AuthLayout from '../components/AuthLayout.vue'

const fullName = ref('')
const username = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const authStore = useAuthStore()
const router = useRouter()

const STEPS = [
  {
    title: 'Submit up to three preferred slots',
    copy: 'Pick from the times teachers have left open. Add a note about what you need.',
  },
  {
    title: 'The center assigns a teacher',
    copy: "Matched on subject, availability and who you've worked with before.",
  },
  {
    title: 'Your class is confirmed',
    copy: 'Date, time, teacher and meeting link land in your calendar. Reminders 24h and 1h before.',
  },
  {
    title: 'Join, then see your report',
    copy: 'One tap into the meeting. Afterwards your teacher files a report and asks how it went.',
  },
]

async function handleRegister() {
  error.value = ''
  loading.value = true
  try {
    await authStore.register({
      username: username.value.trim(),
      email: email.value.trim(),
      password: password.value,
      full_name: fullName.value.trim() || undefined,
    })
    await router.push('/student')
  } catch (err) {
    if (axios.isAxiosError(err)) {
      error.value = err.response?.data?.message || 'Could not create account'
    } else {
      error.value = 'Could not create account'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout center-name="Learning center">
    <p class="step">Your details</p>
    <h1>Create your account</h1>

    <form @submit.prevent="handleRegister">
      <div class="field">
        <label for="full_name">Full name</label>
        <input
          id="full_name"
          v-model="fullName"
          type="text"
          autocomplete="name"
          placeholder="Alex Rivera"
        />
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" />
      </div>

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
          minlength="6"
          autocomplete="new-password"
        />
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button type="submit" class="submit" :disabled="loading">
        {{ loading ? 'Creating account…' : 'Continue' }}
      </button>
    </form>

    <p class="switch">Already have an account? <RouterLink to="/login">Log in</RouterLink></p>
    <p class="switch trial">
      Not ready to register? <RouterLink to="/free-trial">Book a free 30-minute trial</RouterLink>
    </p>

    <template #aside>
      <p class="eyebrow">How booking works</p>
      <h2 class="side-title">You pick the times.<br />We find the teacher.</h2>

      <ol class="steps">
        <li v-for="(item, index) in STEPS" :key="item.title">
          <span class="num" aria-hidden="true">{{ index + 1 }}</span>
          <div>
            <p class="step-title">{{ item.title }}</p>
            <p class="step-copy">{{ item.copy }}</p>
          </div>
        </li>
      </ol>

      <p class="fineprint">
        Sessions run 30 or 60 minutes, 09:00 – 18:00, with a break at lunch. Requests need 48 hours'
        notice.
      </p>
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

.steps {
  display: flex;
  flex-direction: column;
  gap: 18px;
  list-style: none;
  counter-reset: step;
}

.steps li {
  display: flex;
  gap: 14px;
}

.num {
  flex: 0 0 24px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
  font-size: 11px;
  font-weight: 800;
}

.step-title {
  font-size: 13.5px;
  font-weight: 700;
}

.step-copy {
  margin-top: 3px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--lh-muted);
}

.fineprint {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--lh-ghost);
}
</style>
