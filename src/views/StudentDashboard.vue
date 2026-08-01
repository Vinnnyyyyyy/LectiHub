<template>
  <div class="dashboard dashboard-with-rail">
    <div class="atmosphere" aria-hidden="true" />

    <div class="dashboard-frame">
    <AppRail
      :items="railItems"
      :active-id="activeSection"
      :initials="initials"
      :display-name="displayName"
      :brand-name="centreName"
      role-label="Student"
      @select="setSection($event as StudentSection)"
      @logout="handleLogout"
    />

    <div class="dashboard-main">
      <header class="page-head">
        <section class="intro">
          <p class="eyebrow">Student</p>
          <h1>Hi, {{ displayName }}</h1>
          <p>{{ activeIntro }}</p>
        </section>
      </header>

      <main class="content">

      <section
        v-show="activeSection === 'schedule'"
        id="panel-schedule"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-schedule"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="student-schedule">Schedule</h2>
            <p>Pick preferred times and track confirmation from the center.</p>
          </div>
        </div>
        <ScheduleBookingSection />
      </section>

      <section
        v-show="activeSection === 'now'"
        id="panel-now"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-now"
      >
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
            :updating-provider-id="updatingProviderId"
            show-teacher
            @join="handleJoinClass"
            @update-provider="handleUpdateProvider"
          />
          <NotificationsPanel
            subtitle="Confirmations include your teacher, schedule, meeting info, plus reminders before class."
            empty-text="You’re all caught up."
            show-pending-reminders
          />
        </div>
      </section>

      <section
        v-show="activeSection === 'calendar'"
        id="panel-calendar"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-calendar"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="student-calendar">Calendar</h2>
            <p>Month and year view of your classes, plus days teachers still have open.</p>
          </div>
        </div>
        <CalendarPanel
          title="My calendar"
          subtitle="Gold days mark scheduled classes or open teacher availability."
          empty-text="Nothing on this day yet."
          :events="calendarUpcoming"
          :loading="loadingCalendar"
          :highlight-dates="openHighlightDates"
          highlight-label="Teachers available"
        />
      </section>

      <section
        v-show="activeSection === 'history'"
        id="panel-history"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-history"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="student-history">History &amp; feedback</h2>
            <p>Use the sidebar to open pending feedback, lessons, reports, or archived history.</p>
          </div>
        </div>
        <StudentHistoryWorkspace
          :past="past"
          :lesson-reports="lessonReports"
          :my-feedback="myFeedback"
          :archived-history="archivedHistory"
          :loading-classes="loadingClasses"
          :loading-reports="loadingReports"
          :loading-feedback="loadingFeedback"
          :loading-history="loadingHistory"
          :feedback-submitting-id="feedbackSubmittingId"
          :feedback-message="feedbackMessage"
          :feedback-error="feedbackError"
          @submit-feedback="handleSubmitFeedback"
        />
      </section>

      <section
        v-show="activeSection === 'payments'"
        id="panel-payments"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-payments"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="student-payments">Payments</h2>
            <p>Submit a payment receipt for admin review and keep your invoice history here.</p>
          </div>
        </div>
        <StudentPaymentReceiptsPanel />
      </section>

      <section
        v-show="activeSection === 'homework'"
        id="panel-homework"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-homework"
      >
        <HomeworkView />
      </section>
      </main>
    </div>
    </div>

    <ClassChatWidget />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppRail, { type RailItem } from '../components/AppRail.vue'
import { initialsFrom } from '../utils/initials'
import { useClassesStore, type ConfirmedSchedule } from '../stores/classes'
import { useLessonReportsStore } from '../stores/lessonReports'
import {
  useStudentFeedbackStore,
  type StudentFeedbackPayload,
} from '../stores/studentFeedback'
import { useNotificationsStore } from '../stores/notifications'
import { useCalendarStore } from '../stores/calendar'
import { useAvailabilityStore } from '../stores/availability'
import { useSettingsStore } from '../stores/settings'
import ScheduleBookingSection from '../components/ScheduleBookingSection.vue'
import UpcomingClassesPanel from '../components/UpcomingClassesPanel.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import CalendarPanel from '../components/CalendarPanel.vue'
import StudentHistoryWorkspace from '../components/StudentHistoryWorkspace.vue'
import ClassChatWidget from '../components/ClassChatWidget.vue'
import StudentPaymentReceiptsPanel from '../components/StudentPaymentReceiptsPanel.vue'
import HomeworkView from './student/HomeworkView.vue'

type StudentSection = 'schedule' | 'now' | 'calendar' | 'history' | 'payments' | 'homework'

const navItems: {
  id: StudentSection
  label: string
  intro: string
  icon: RailItem['icon']
}[] = [
  {
    id: 'now',
    label: 'My week',
    intro: 'Join upcoming sessions and check alerts that need a look.',
    icon: 'calendar',
  },
  {
    id: 'schedule',
    label: 'Book a class',
    intro: 'Pick preferred times and track confirmation from the center.',
    icon: 'list',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    intro: 'Month and year view of your classes, plus days teachers still have open.',
    icon: 'grid',
  },
  {
    id: 'homework',
    label: 'Homework & grades',
    intro: 'View assigned homework, submit work, and check grades.',
    icon: 'book',
  },
  {
    id: 'history',
    label: 'History & feedback',
    intro: 'Use the sidebar to open pending feedback, lessons, reports, or archived history.',
    icon: 'clock',
  },
  {
    id: 'payments',
    label: 'Payments',
    intro: 'Submit a payment receipt for admin review and keep your invoice history here.',
    icon: 'chart',
  },
]

const activeSection = ref<StudentSection>('now')

const activeIntro = computed(
  () => navItems.find((item) => item.id === activeSection.value)?.intro ?? '',
)

const railItems = computed<RailItem[]>(() =>
  navItems.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
  })),
)

function setSection(section: StudentSection) {
  activeSection.value = section
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const authStore = useAuthStore()
const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const availabilityStore = useAvailabilityStore()
const router = useRouter()

const {
  loading: loadingClasses,
  loadingHistory,
  joiningId,
  joinMessage,
  error: joinError,
} = storeToRefs(classesStore)
const updatingProviderId = ref<number | null>(null)
const { loading: loadingReports, reports: lessonReports } = storeToRefs(lessonReportsStore)
const {
  loading: loadingFeedback,
  submittingId: feedbackSubmittingId,
  message: feedbackMessage,
  error: feedbackError,
  feedback: myFeedback,
} = storeToRefs(studentFeedbackStore)
const { loading: loadingCalendar } = storeToRefs(calendarStore)
const { openDates } = storeToRefs(availabilityStore)
const upcoming = computed(() => classesStore.upcoming)
const past = computed(() => classesStore.past)
const archivedHistory = computed(() => classesStore.archived)
const calendarUpcoming = computed(() => calendarStore.upcoming)
const openHighlightDates = computed(() => openDates.value)

const displayName = computed(
  () => authStore.fullName || authStore.username || 'student',
)
const initials = computed(() => initialsFrom(displayName.value))

async function handleJoinClass(item: ConfirmedSchedule, meetingProvider?: string) {
  try {
    await classesStore.joinClass(item.id, meetingProvider)
  } catch {
    // store sets error message
  }
}

async function handleUpdateProvider(item: ConfirmedSchedule, meetingProvider: string) {
  updatingProviderId.value = item.id
  try {
    await classesStore.updateMeetingProvider(item.id, meetingProvider)
  } catch {
    // store sets error message
  } finally {
    updatingProviderId.value = null
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

const settingsStore = useSettingsStore()
const centreName = computed(
  () => String(settingsStore.settings['center.name'] || 'LectiHub'),
)

onMounted(async () => {
  await Promise.allSettled([
    classesStore.fetchMine(),
    classesStore.fetchHistory(),
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
    notificationsStore.fetchMine(),
    calendarStore.fetchMine(),
    availabilityStore.fetchOpen(),
    settingsStore.fetchPublic(),
  ])
})
</script>

<style scoped>
/* Shell styles live in assets/dashboard.css */
</style>
