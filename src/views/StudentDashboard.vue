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
        <p class="eyebrow">Student</p>
        <h1>Hi, {{ displayName }}</h1>
        <p>
          Request a schedule, join upcoming sessions, then review reports and leave feedback when
          they are ready.
        </p>
      </section>

      <section class="dash-section" aria-labelledby="student-schedule">
        <div class="dash-section-label">
          <div>
            <h2 id="student-schedule">Schedule</h2>
            <p>Pick preferred times and track confirmation from the center.</p>
          </div>
        </div>
        <ScheduleBookingSection />
      </section>

      <section class="dash-section" aria-labelledby="student-now">
        <div class="dash-section-label">
          <div>
            <h2 id="student-now">Now</h2>
            <p>Classes coming up and alerts that need a look.</p>
          </div>
        </div>
        <p v-if="joinMessage" class="join-feedback" role="status">{{ joinMessage }}</p>
        <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>
        <div class="dash-grid-2">
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
        </div>
      </section>

      <section class="dash-section" aria-labelledby="student-calendar">
        <div class="dash-section-label">
          <div>
            <h2 id="student-calendar">Calendar</h2>
            <p>Approved classes appear here automatically.</p>
          </div>
        </div>
        <CalendarPanel
          title="My calendar"
          subtitle="Approved classes are added here automatically."
          empty-text="No calendar events yet."
          :events="calendarUpcoming"
          :loading="loadingCalendar"
        />
      </section>

      <section class="dash-section" aria-labelledby="student-history">
        <div class="dash-section-label">
          <div>
            <h2 id="student-history">History &amp; feedback</h2>
            <p>Past lessons, teacher reports, and feedback after each report.</p>
          </div>
        </div>
        <p v-if="feedbackMessage" class="join-feedback" role="status">{{ feedbackMessage }}</p>
        <p v-if="feedbackError" class="join-feedback error" role="alert">{{ feedbackError }}</p>
        <div class="dash-grid-2">
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
        <ClassHistoryPanel
          title="Learning history"
          subtitle="Classes archived after both the lesson report and your feedback are submitted."
          empty-text="No archived learning history yet."
          :items="archivedHistory"
          :loading="loadingHistory"
          show-teacher
        />
      </section>
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
import ClassHistoryPanel from '../components/ClassHistoryPanel.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import CalendarPanel from '../components/CalendarPanel.vue'

const authStore = useAuthStore()
const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const router = useRouter()

const {
  loading: loadingClasses,
  loadingHistory,
  joiningId,
  joinMessage,
  error: joinError,
} = storeToRefs(classesStore)
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
const archivedHistory = computed(() => classesStore.archived)
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
    await Promise.allSettled([
      lessonReportsStore.fetchMine(),
      classesStore.fetchMine(),
      classesStore.fetchHistory(),
    ])
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
    classesStore.fetchHistory(),
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
    notificationsStore.fetchMine(),
    calendarStore.fetchMine(),
  ])
})
</script>

<style scoped>
/* Shell styles live in assets/dashboard.css */
</style>
