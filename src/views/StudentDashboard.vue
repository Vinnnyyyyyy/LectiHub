<template>
  <div class="dashboard">
    <div class="atmosphere" aria-hidden="true" />

    <header class="topbar">
      <div>
        <p class="brand">LectiHub</p>
        <p class="greeting">Welcome back, {{ displayName }}</p>
      </div>
      <button type="button" class="logout" @click="handleLogout">Log out</button>
    </header>

    <main class="content">
      <section class="intro">
        <h1>Student Dashboard</h1>
        <p>Your place for scheduling, upcoming classes, notifications, and lesson history.</p>
      </section>

      <ScheduleBookingSection />

      <CalendarPanel
        title="My calendar"
        subtitle="Approved classes are added here automatically."
        empty-text="No calendar events yet."
        :events="calendarUpcoming"
        :loading="loadingCalendar"
      />

      <p v-if="joinMessage" class="join-feedback" role="status">{{ joinMessage }}</p>
      <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>

      <div class="panels">
        <UpcomingClassesPanel
          title="Upcoming classes"
          subtitle="At the scheduled time, join your online class from here."
          empty-text="No upcoming classes yet."
          :items="upcoming"
          :loading="loadingClasses"
          :allow-join="true"
          :joining-id="joiningId"
          show-teacher
          @join="handleJoinClass"
        />

        <NotificationsPanel
          subtitle="Confirmations include your teacher, schedule, meeting info, plus reminders before class."
          empty-text="You’re all caught up."
          show-pending-reminders
        />

        <UpcomingClassesPanel
          title="Lesson history"
          subtitle="Past lessons with attendance notes and recordings when available."
          empty-text="No lessons recorded yet."
          :items="past"
          :loading="loadingClasses"
          show-teacher
        />

        <LessonReportsPanel
          title="Lesson reports"
          subtitle="Reports submitted by your teacher after each class."
          empty-text="No lesson reports yet."
          :items="lessonReports"
          :loading="loadingReports"
          show-teacher
        />

        <StudentFeedbackFormPanel
          :reports="lessonReports"
          :loading="loadingReports"
          :submitting-id="feedbackSubmittingId"
          @submit="handleSubmitFeedback"
        />

        <StudentFeedbackPanel
          title="Your submitted feedback"
          subtitle="Feedback you have shared after lesson reports."
          empty-text="No feedback submitted yet."
          :items="myFeedback"
          :loading="loadingFeedback"
          show-teacher
        />
      </div>

      <p v-if="feedbackMessage" class="join-feedback" role="status">{{ feedbackMessage }}</p>
      <p v-if="feedbackError" class="join-feedback error" role="alert">{{ feedbackError }}</p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useClassesStore, type ConfirmedSchedule } from '../stores/classes'
import { useLessonReportsStore } from '../stores/lessonReports'
import {
  useStudentFeedbackStore,
  type StudentFeedbackPayload,
} from '../stores/studentFeedback'
import { useNotificationsStore } from '../stores/notifications'
import { useCalendarStore } from '../stores/calendar'
import ScheduleBookingSection from '../components/ScheduleBookingSection.vue'
import UpcomingClassesPanel from '../components/UpcomingClassesPanel.vue'
import LessonReportsPanel from '../components/LessonReportsPanel.vue'
import StudentFeedbackFormPanel from '../components/StudentFeedbackFormPanel.vue'
import StudentFeedbackPanel from '../components/StudentFeedbackPanel.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import CalendarPanel from '../components/CalendarPanel.vue'

const authStore = useAuthStore()
const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const router = useRouter()

const { loading: loadingClasses, joiningId, joinMessage, error: joinError } =
  storeToRefs(classesStore)
const { loading: loadingReports, reports: lessonReports } = storeToRefs(lessonReportsStore)
const {
  loading: loadingFeedback,
  submittingId: feedbackSubmittingId,
  message: feedbackMessage,
  error: feedbackError,
  feedback: myFeedback,
} = storeToRefs(studentFeedbackStore)
const { loading: loadingCalendar } = storeToRefs(calendarStore)
const upcoming = computed(() => classesStore.upcoming)
const past = computed(() => classesStore.past)
const calendarUpcoming = computed(() => calendarStore.upcoming)

const displayName = computed(
  () => authStore.fullName || authStore.username || 'student',
)

async function handleJoinClass(item: ConfirmedSchedule) {
  try {
    await classesStore.joinClass(item.id)
  } catch {
    // store sets error message
  }
}

async function handleSubmitFeedback(reportId: number, payload: StudentFeedbackPayload) {
  try {
    await studentFeedbackStore.submitForReport(reportId, payload)
    await lessonReportsStore.fetchMine()
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
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
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
  overflow-x: hidden;
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
  animation: fade-down 0.45s ease both;
}

.brand {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.45rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--lh-accent);
}

.greeting {
  font-family: 'Manrope', sans-serif;
  font-size: 0.92rem;
  color: var(--lh-muted);
  margin-top: 0.15rem;
}

.logout {
  font-family: 'Manrope', sans-serif;
  font-size: 0.88rem;
  font-weight: 700;
  padding: 0.55rem 0.9rem;
  border-radius: 0.65rem;
  border: 1px solid var(--lh-line);
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease,
    border-color 0.18s ease;
}

.logout:hover {
  border-color: var(--lh-line-strong);
  transform: translateY(-1px);
}

.content {
  max-width: 68rem;
  margin: 0 auto;
  padding: 1rem 1.5rem 2.5rem;
  display: grid;
  gap: 1.1rem;
}

.intro {
  animation: fade-up 0.5s ease both;
}

.intro h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(1.7rem, 3vw, 2.2rem);
  font-weight: 550;
  letter-spacing: -0.03em;
  color: var(--lh-ink);
}

.intro p {
  font-family: 'Manrope', sans-serif;
  margin-top: 0.4rem;
  max-width: 36rem;
  color: var(--lh-muted);
  line-height: 1.5;
}

.panels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.panel {
  padding: 1.25rem 1.2rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
  animation: fade-up 0.55s ease both;
  animation-delay: var(--delay);
}

.panel h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

.panel p {
  font-family: 'Manrope', sans-serif;
  font-size: 0.92rem;
  line-height: 1.45;
  margin-top: 0.35rem;
  color: var(--lh-muted);
}

.empty {
  margin-top: 1rem !important;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint) !important;
  font-style: italic;
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

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fade-down {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 720px) {
  .panels {
    grid-template-columns: 1fr;
  }

  .topbar {
    align-items: center;
  }
}
</style>
