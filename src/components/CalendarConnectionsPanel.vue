<template>
  <section class="panel">
    <div class="section-head">
      <h2>Calendar connections</h2>
    </div>
    <p class="subtitle">
      Connect Google Calendar or Calendly so approved classes sync automatically and conflicts stay
      low.
    </p>

    <div class="providers">
      <article class="provider">
        <div>
          <strong>Google Calendar</strong>
          <p v-if="googleConnected" class="status on">Connected</p>
          <p v-else class="status">Not connected</p>
          <p v-if="googleAccount" class="meta">{{ googleAccount }}</p>
        </div>
        <button
          v-if="!googleConnected"
          type="button"
          class="action"
          :disabled="connecting"
          @click="connectGoogle"
        >
          {{ connecting ? 'Connecting...' : 'Connect' }}
        </button>
        <button
          v-else
          type="button"
          class="action ghost"
          :disabled="connecting"
          @click="disconnect('google')"
        >
          Disconnect
        </button>
      </article>

      <article class="provider">
        <div>
          <strong>Calendly</strong>
          <p v-if="calendlyConnected" class="status on">Connected</p>
          <p v-else class="status">Not connected</p>
          <p v-if="calendlyAccount" class="meta">{{ calendlyAccount }}</p>
        </div>
        <button
          v-if="!calendlyConnected"
          type="button"
          class="action"
          :disabled="connecting"
          @click="connectCalendly"
        >
          {{ connecting ? 'Connecting...' : 'Connect' }}
        </button>
        <button
          v-else
          type="button"
          class="action ghost"
          :disabled="connecting"
          @click="disconnect('calendly')"
        >
          Disconnect
        </button>
      </article>
    </div>

    <p v-if="message" class="hint">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useCalendarStore } from '../stores/calendar'

const authStore = useAuthStore()
const calendarStore = useCalendarStore()
const { connecting, connections, error } = storeToRefs(calendarStore)
const message = ref('')

const googleConnected = computed(() => calendarStore.googleConnected)
const calendlyConnected = computed(() => calendarStore.calendlyConnected)

const googleAccount = computed(
  () => connections.value.find((c) => c.provider === 'google' && c.isActive)?.externalAccount || '',
)
const calendlyAccount = computed(
  () =>
    connections.value.find((c) => c.provider === 'calendly' && c.isActive)?.externalAccount || '',
)

async function connectGoogle() {
  message.value = ''
  await calendarStore.connectProvider('google', {
    externalAccount: authStore.username
      ? `${authStore.username}@gmail.com`
      : 'teacher-google@lectihub.local',
    calendarId: 'primary',
  })
  message.value = 'Google Calendar connected. Future approved classes will sync automatically.'
}

async function connectCalendly() {
  message.value = ''
  await calendarStore.connectProvider('calendly', {
    externalAccount: authStore.username
      ? `${authStore.username}.calendly`
      : 'teacher-calendly',
    schedulingUrl: 'https://calendly.com/lectihub-teacher',
  })
  message.value = 'Calendly connected. Future approved classes will sync automatically.'
}

async function disconnect(provider: 'google' | 'calendly') {
  message.value = ''
  await calendarStore.disconnectProvider(provider)
  message.value = `${provider === 'google' ? 'Google Calendar' : 'Calendly'} disconnected.`
}
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
  color: var(--lh-accent);
}

.subtitle,
p,
strong,
button,
.hint,
.error,
.meta,
.status {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.9rem;
}

.providers {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.9rem;
}

.provider {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.62);
}

.status {
  margin-top: 0.2rem;
  font-size: 0.84rem;
  color: var(--lh-faint);
}

.status.on {
  color: var(--lh-accent);
  font-weight: 700;
}

.meta {
  font-size: 0.8rem;
  color: var(--lh-muted);
}

.action {
  border: none;
  border-radius: 0.6rem;
  padding: 0.55rem 0.8rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
  cursor: pointer;
  white-space: nowrap;
}

.action.ghost {
  background: transparent;
  border: 1px solid var(--lh-line);
  color: var(--lh-ink);
}

.action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hint {
  margin-top: 0.7rem;
  color: var(--lh-accent);
  font-size: 0.88rem;
}

.error {
  margin-top: 0.5rem;
  color: var(--lh-danger);
  font-size: 0.88rem;
}
</style>
