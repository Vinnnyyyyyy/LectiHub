<template>
  <div class="dashboard">
    <div class="atmosphere" aria-hidden="true" />

    <header class="topbar dash-topbar">
      <div class="topbar-brand">
        <p class="brand">LectiHub</p>
        <p class="greeting">Welcome, {{ displayName }}</p>
      </div>

      <nav class="dash-nav" aria-label="Teacher dashboard sections">
        <div class="dash-nav-track" role="tablist">
          <button
            v-for="item in navItems"
            :id="`tab-${item.id}`"
            :key="item.id"
            type="button"
            role="tab"
            class="dash-nav-item"
            :class="{ active: activeSection === item.id }"
            :aria-selected="activeSection === item.id"
            :aria-controls="`panel-${item.id}`"
            :tabindex="activeSection === item.id ? 0 : -1"
            @click="setSection(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </nav>

      <button type="button" class="logout" @click="handleLogout">Log out</button>
    </header>

    <main class="content">
      <section class="intro">
        <p class="eyebrow">Teacher</p>
        <h1>Hi, {{ displayName }}</h1>
        <p>{{ activeIntro }}</p>
      </section>

      <section
        v-show="activeSection === 'today'"
        id="panel-today"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-today"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="teacher-today">Today</h2>
            <p>Upcoming classes and assignment alerts.</p>
          </div>
        </div>
        <p v-if="joinMessage" class="join-feedback" role="status">{{ joinMessage }}</p>
        <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>
        <div class="dash-grid-2">
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
          <NotificationsPanel
            subtitle="New assignments include student, date/time, duration, and meeting details."
            empty-text="No class assignment notifications yet."
          />
        </div>
      </section>

      <section
        v-show="activeSection === 'conduct'"
        id="panel-conduct"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-conduct"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="teacher-conduct">Conduct &amp; report</h2>
            <p>Attendance, curriculum coverage, recording link, then the post-lesson report.</p>
          </div>
        </div>
        <div class="dash-stack">
          <p v-if="conductMessage" class="join-feedback" role="status">{{ conductMessage }}</p>
          <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>
          <ConductLessonPanel
            :items="inProgress"
            :loading="loading"
            :saving-id="savingId"
            @save="handleSaveConduct"
            @complete="handleCompleteLesson"
          />
          <LessonReportFormPanel
            :completed-classes="past"
            :loading="loading"
            :submitting-id="reportSubmittingId"
            @submit="handleSubmitReport"
          />
          <p v-if="reportMessage" class="join-feedback" role="status">{{ reportMessage }}</p>
          <p v-if="reportError" class="join-feedback error" role="alert">{{ reportError }}</p>
        </div>
      </section>

      <section
        v-show="activeSection === 'records'"
        id="panel-records"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-records"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="teacher-records">Records</h2>
            <p>Submitted reports, past classes, and archived teaching history.</p>
          </div>
        </div>
        <div class="dash-grid-2">
          <LessonReportsPanel
            title="Submitted lesson reports"
            subtitle="Reports you have filed for completed classes."
            empty-text="No lesson reports submitted yet."
            :items="lessonReports"
            :loading="loadingReports"
            show-student
          />
          <UpcomingClassesPanel
            title="Past classes"
            subtitle="Completed lessons with attendance, participation, and recordings."
            empty-text="No past classes yet."
            :items="past"
            :loading="loading"
            show-student
          />
        </div>
        <ClassHistoryPanel
          title="Teaching history"
          subtitle="Classes archived after both the lesson report and student feedback are submitted."
          empty-text="No archived teaching history yet."
          :items="archivedHistory"
          :loading="loadingHistory"
          show-student
        />
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
            <h2 id="teacher-calendar">Calendar</h2>
            <p>LectiHub calendar plus optional Google Calendar or Calendly sync.</p>
          </div>
        </div>
        <div class="dash-stack">
          <CalendarConnectionsPanel />
          <CalendarPanel
            title="My calendar"
            subtitle="Approved class schedules appear here automatically."
            empty-text="No calendar events yet."
            :events="calendarUpcoming"
            :loading="loadingCalendar"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import {
  useClassesStore,
  type ConfirmedSchedule,
  type LessonConductPayload,
} from '../stores/classes'
import {
  useLessonReportsStore,
  type LessonReportPayload,
} from '../stores/lessonReports'
import { useNotificationsStore } from '../stores/notifications'
import { useCalendarStore } from '../stores/calendar'
import UpcomingClassesPanel from '../components/UpcomingClassesPanel.vue'
import ConductLessonPanel from '../components/ConductLessonPanel.vue'
import LessonReportFormPanel from '../components/LessonReportFormPanel.vue'
import LessonReportsPanel from '../components/LessonReportsPanel.vue'
import ClassHistoryPanel from '../components/ClassHistoryPanel.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import CalendarPanel from '../components/CalendarPanel.vue'
import CalendarConnectionsPanel from '../components/CalendarConnectionsPanel.vue'

type TeacherSection = 'today' | 'conduct' | 'records' | 'calendar'

const navItems: { id: TeacherSection; label: string; intro: string }[] = [
  {
    id: 'today',
    label: 'Today',
    intro: 'Upcoming classes and assignment alerts.',
  },
  {
    id: 'conduct',
    label: 'Conduct & report',
    intro: 'Take attendance, note progress, then file the lesson report.',
  },
  {
    id: 'records',
    label: 'Records',
    intro: 'Submitted reports, past classes, and archived teaching history.',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    intro: 'LectiHub calendar plus optional Google Calendar or Calendly sync.',
  },
]

const activeSection = ref<TeacherSection>('today')

const activeIntro = computed(
  () => navItems.find((item) => item.id === activeSection.value)?.intro ?? '',
)

function setSection(section: TeacherSection) {
  activeSection.value = section
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const authStore = useAuthStore()
const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const router = useRouter()

const {
  loading,
  loadingHistory,
  joiningId,
  savingId,
  joinMessage,
  conductMessage,
  error: joinError,
} = storeToRefs(classesStore)
const {
  loading: loadingReports,
  submittingId: reportSubmittingId,
  message: reportMessage,
  error: reportError,
  reports: lessonReports,
} = storeToRefs(lessonReportsStore)
const { loading: loadingCalendar } = storeToRefs(calendarStore)
const upcoming = computed(() => classesStore.upcoming)
const past = computed(() => classesStore.past)
const inProgress = computed(() => classesStore.inProgress)
const archivedHistory = computed(() => classesStore.archived)
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
    // Refresh so Records / report form stay in sync after completion.
    await Promise.allSettled([classesStore.fetchMine(), classesStore.fetchHistory()])
  } catch {
    // store sets error message (shown above the conduct panel)
  }
}

async function handleSubmitReport(classId: number, payload: LessonReportPayload) {
  try {
    await lessonReportsStore.submitForClass(classId, payload)
    await Promise.allSettled([classesStore.fetchMine(), classesStore.fetchHistory()])
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
    notificationsStore.fetchMine(),
    calendarStore.fetchMine(),
  ])
})
</script>

<style scoped>
/* Shell styles live in assets/dashboard.css */
</style>
