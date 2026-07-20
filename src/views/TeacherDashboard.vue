<template>
  <div class="dashboard">
    <div class="atmosphere" aria-hidden="true" />

    <header class="topbar">
      <div>
        <p class="brand">LectiHub</p>
        <p class="greeting">Welcome, {{ displayName }}</p>
      </div>
      <button type="button" class="logout" @click="handleLogout">Log out</button>
    </header>

    <main class="content">
      <section class="intro">
        <h1>Teacher Dashboard</h1>
        <p>Your confirmed class schedules with students, times, and meeting details.</p>
      </section>

      <NotificationsPanel
        subtitle="New assignments include student, date/time, duration, and meeting details."
        empty-text="No class assignment notifications yet."
      />

      <UpcomingClassesPanel
        title="Upcoming classes"
        subtitle="Schedules created after admin approval and teacher assignment."
        empty-text="No upcoming classes assigned yet."
        :items="upcoming"
        :loading="loading"
        show-student
      />

      <UpcomingClassesPanel
        title="Past classes"
        subtitle="Earlier confirmed lessons."
        empty-text="No past classes yet."
        :items="past"
        :loading="loading"
        show-student
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useClassesStore } from '../stores/classes'
import { useNotificationsStore } from '../stores/notifications'
import UpcomingClassesPanel from '../components/UpcomingClassesPanel.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'

const authStore = useAuthStore()
const classesStore = useClassesStore()
const notificationsStore = useNotificationsStore()
const router = useRouter()

const { loading } = storeToRefs(classesStore)
const upcoming = computed(() => classesStore.upcoming)
const past = computed(() => classesStore.past)
const displayName = computed(() => authStore.fullName || authStore.username || 'teacher')

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}

onMounted(async () => {
  await Promise.allSettled([classesStore.fetchMine(), notificationsStore.fetchMine()])
})
</script>

<style scoped>
.dashboard {
  position: relative;
  min-height: 100vh;
  color: var(--lh-ink);
}

.atmosphere {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--lh-atmosphere);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.4rem 1.5rem 0.5rem;
}

.brand {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.45rem;
  font-weight: 600;
  color: var(--lh-accent);
}

.greeting,
.logout,
.intro p {
  font-family: 'Manrope', sans-serif;
}

.greeting {
  font-size: 0.92rem;
  color: var(--lh-muted);
  margin-top: 0.15rem;
}

.logout {
  font-size: 0.88rem;
  font-weight: 700;
  padding: 0.55rem 0.9rem;
  border-radius: 0.65rem;
  border: 1px solid var(--lh-line);
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
}

.content {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1rem 1.5rem 2.5rem;
  display: grid;
  gap: 1rem;
}

.intro h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(1.7rem, 3vw, 2.2rem);
  font-weight: 550;
}

.intro p {
  margin-top: 0.4rem;
  color: var(--lh-muted);
  max-width: 36rem;
}
</style>
