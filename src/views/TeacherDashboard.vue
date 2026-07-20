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
        <p>
          Confirmed classes sync to your LectiHub calendar, and to Google Calendar or Calendly when
          connected.
        </p>
      </section>

      <CalendarConnectionsPanel />

      <CalendarPanel
        title="My calendar"
        subtitle="Approved class schedules appear here automatically."
        empty-text="No calendar events yet."
        :events="calendarUpcoming"
        :loading="loadingCalendar"
      />

      <NotificationsPanel
        subtitle="New assignments include student, date/time, duration, and meeting details."
        empty-text="No class assignment notifications yet."
      />

      <UpcomingClassesPanel
        title="Upcoming classes"
        subtitle="At the scheduled time, join the online meeting with your student."
        empty-text="No upcoming classes assigned yet."
        :items="upcoming"
        :loading="loading"
        :allow-join="true"
        :joining-id="joiningId"
        show-student
        @join="handleJoinClass"
      />
      <p v-if="joinMessage" class="join-feedback" role="status">{{ joinMessage }}</p>
      <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>

      <ConductLessonPanel
        :items="inProgress"
        :loading="loading"
        :saving-id="savingId"
        @save="handleSaveConduct"
        @complete="handleCompleteLesson"
      />
      <p v-if="conductMessage" class="join-feedback" role="status">{{ conductMessage }}</p>

      <UpcomingClassesPanel
        title="Past classes"
        subtitle="Completed lessons with attendance, participation, and recordings."
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
import {
  useClassesStore,
  type ConfirmedSchedule,
  type LessonConductPayload,
} from '../stores/classes'
import { useNotificationsStore } from '../stores/notifications'
import { useCalendarStore } from '../stores/calendar'
import UpcomingClassesPanel from '../components/UpcomingClassesPanel.vue'
import ConductLessonPanel from '../components/ConductLessonPanel.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import CalendarPanel from '../components/CalendarPanel.vue'
import CalendarConnectionsPanel from '../components/CalendarConnectionsPanel.vue'

const authStore = useAuthStore()
const classesStore = useClassesStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const router = useRouter()

const {
  loading,
  joiningId,
  savingId,
  joinMessage,
  conductMessage,
  error: joinError,
} = storeToRefs(classesStore)
const { loading: loadingCalendar } = storeToRefs(calendarStore)
const upcoming = computed(() => classesStore.upcoming)
const past = computed(() => classesStore.past)
const inProgress = computed(() => classesStore.inProgress)
const calendarUpcoming = computed(() => calendarStore.upcoming)
const displayName = computed(() => authStore.fullName || authStore.username || 'teacher')

async function handleJoinClass(item: ConfirmedSchedule) {
  try {
    await classesStore.joinClass(item.id)
  } catch {
    // store sets error message
  }
}

async function handleSaveConduct(classId: number, payload: LessonConductPayload) {
  try {
    await classesStore.saveConduct(classId, payload)
  } catch {
    // store sets error message
  }
}

async function handleCompleteLesson(classId: number, payload: LessonConductPayload) {
  try {
    await classesStore.completeClass(classId, payload)
  } catch {
    // store sets error message
  }
}

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}

onMounted(async () => {
  await Promise.allSettled([
    classesStore.fetchMine(),
    notificationsStore.fetchMine(),
    calendarStore.fetchMine(),
  ])
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

.join-feedback {
  font-family: 'Manrope', sans-serif;
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(45, 212, 191, 0.35);
  background: rgba(45, 212, 191, 0.1);
  color: #99f6e4;
  font-size: 0.9rem;
}

.join-feedback.error {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.1);
  color: #fecaca;
}
</style>
