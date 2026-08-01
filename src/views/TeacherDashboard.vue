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
      role-label="Teacher"
      @select="setSection($event as TeacherSection)"
      @logout="handleLogout"
    />

    <div class="dashboard-main">
      <header class="page-head">
        <section class="intro">
          <p class="eyebrow">Teacher</p>
          <h1>Hi, {{ displayName }}</h1>
          <p>{{ activeIntro }}</p>
        </section>
      </header>

      <main class="content">

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
            :updating-provider-id="updatingProviderId"
            show-student
            @join="handleJoinClass"
            @update-provider="handleUpdateProvider"
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
            <p>Conduct the live lesson on the left. File the post-lesson report on the right.</p>
          </div>
        </div>

        <div class="conduct-workspace">
          <div v-if="conductMessage || joinError || reportMessage || reportError" class="conduct-banners">
            <p v-if="conductMessage" class="join-feedback" role="status">{{ conductMessage }}</p>
            <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>
            <p v-if="reportMessage" class="join-feedback" role="status">{{ reportMessage }}</p>
            <p v-if="reportError" class="join-feedback error" role="alert">{{ reportError }}</p>
          </div>

          <div class="conduct-columns">
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
          </div>
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
        v-show="activeSection === 'calendar-connections'"
        id="panel-calendar-connections"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-calendar-connections"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="tab-calendar-connections">Calendar connections</h2>
            <p>Connect Google or Calendly so busy times block your open hours.</p>
          </div>
        </div>
        <CalendarConnectionsPanel />
      </section>

      <section
        v-show="activeSection === 'my-calendar'"
        id="panel-my-calendar"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-my-calendar"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="tab-my-calendar">My calendar</h2>
            <p>Day, month, and year view of your classes — day shows vacant open hours.</p>
          </div>
        </div>
        <CalendarPanel
          title="My calendar"
          subtitle="Use day view to see vacant open hours vs booked lessons."
          empty-text="Nothing on this day yet."
          :events="calendarUpcoming"
          :loading="loadingCalendar"
          :time-slots="availabilityTimeSlots"
          :weekly-open-slots="myAvailabilitySlots"
        />
      </section>

      <section
        v-show="activeSection === 'weekly-availability'"
        id="panel-weekly-availability"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-weekly-availability"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="tab-weekly-availability">My weekly availability</h2>
            <p>Set the weekly open hours students can book against.</p>
          </div>
        </div>
        <TeacherAvailabilityPanel />
      </section>

      <section
        v-show="activeSection === 'materials'"
        id="panel-materials"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-materials"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="tab-materials">Course materials</h2>
            <p>View materials for courses assigned to you. Discussion only — no upload, edit, or download.</p>
          </div>
        </div>
        <CourseMaterialsBrowse mode="teacher" />
      </section>

      <section
        v-show="activeSection === 'settings'"
        id="panel-settings"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-settings"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="tab-settings">Settings</h2>
            <p>Update your account password.</p>
          </div>
        </div>
        <ChangePasswordPanel />
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
import { useSettingsStore } from '../stores/settings'
import UpcomingClassesPanel from '../components/UpcomingClassesPanel.vue'
import ConductLessonPanel from '../components/ConductLessonPanel.vue'
import LessonReportFormPanel from '../components/LessonReportFormPanel.vue'
import LessonReportsPanel from '../components/LessonReportsPanel.vue'
import ClassHistoryPanel from '../components/ClassHistoryPanel.vue'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import CalendarPanel from '../components/CalendarPanel.vue'
import { useAvailabilityStore } from '../stores/availability'
import CalendarConnectionsPanel from '../components/CalendarConnectionsPanel.vue'
import TeacherAvailabilityPanel from '../components/TeacherAvailabilityPanel.vue'
import CourseMaterialsBrowse from '../components/CourseMaterialsBrowse.vue'
import ClassChatWidget from '../components/ClassChatWidget.vue'
import ChangePasswordPanel from '../components/ChangePasswordPanel.vue'

type TeacherSection =
  | 'today'
  | 'conduct'
  | 'records'
  | 'materials'
  | 'calendar-connections'
  | 'my-calendar'
  | 'weekly-availability'
  | 'settings'

const CALENDAR_CHILD_IDS: TeacherSection[] = [
  'calendar-connections',
  'my-calendar',
  'weekly-availability',
]

const navItems: {
  id: TeacherSection
  label: string
  intro: string
  icon: RailItem['icon']
}[] = [
  {
    id: 'today',
    label: 'My teaching week',
    intro: 'Upcoming classes and assignment alerts.',
    icon: 'calendar',
  },
  {
    id: 'conduct',
    label: 'In session',
    intro: 'Conduct the live lesson on the left. File the post-lesson report on the right.',
    icon: 'clock',
  },
  {
    id: 'records',
    label: 'Records',
    intro: 'Submitted reports, past classes, and archived teaching history.',
    icon: 'chart',
  },
  {
    id: 'materials',
    label: 'Course materials',
    intro: 'Open materials for courses assigned to you. View only — no upload, edit, or download.',
    icon: 'book',
  },
  {
    id: 'calendar-connections',
    label: 'Calendar connections',
    intro: 'Connect Google or Calendly so busy times block your open hours.',
    icon: 'people',
  },
  {
    id: 'my-calendar',
    label: 'My calendar',
    intro: 'Day, month, and year view of your classes — day shows vacant open hours.',
    icon: 'grid',
  },
  {
    id: 'weekly-availability',
    label: 'My weekly availability',
    intro: 'Set the weekly open hours students can book against.',
    icon: 'list',
  },
  {
    id: 'settings',
    label: 'Settings',
    intro: 'Manage your account password.',
    icon: 'gear',
  },
]

const activeSection = ref<TeacherSection>('today')

const activeIntro = computed(
  () => navItems.find((item) => item.id === activeSection.value)?.intro ?? '',
)

async function setSection(section: TeacherSection) {
  activeSection.value = section
  const main = document.querySelector('.dashboard-main')
  if (main instanceof HTMLElement) {
    main.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Clear the My calendar assignment dot once the teacher opens that view.
  if (section === 'my-calendar') {
    const unreadAssignments = notificationsStore.notifications.filter(
      (item) => !item.isRead && item.type === 'schedule_confirmed',
    )
    await Promise.allSettled(unreadAssignments.map((item) => notificationsStore.markRead(item.id)))
    await Promise.allSettled([availabilityStore.fetchMine()])
  }
}

const authStore = useAuthStore()
const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const availabilityStore = useAvailabilityStore()
const router = useRouter()

const { notifications } = storeToRefs(notificationsStore)
const { mySlots: myAvailabilitySlots, timeSlots: availabilityTimeSlots } =
  storeToRefs(availabilityStore)

/** Unread "admin assigned you a class" alerts — drives the My calendar dot. */
const hasUnreadAssignment = computed(() =>
  notifications.value.some((item) => !item.isRead && item.type === 'schedule_confirmed'),
)

const {
  loading,
  loadingHistory,
  joiningId,
  savingId,
  joinMessage,
  conductMessage,
  error: joinError,
} = storeToRefs(classesStore)
const updatingProviderId = ref<number | null>(null)
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
const initials = computed(() => initialsFrom(displayName.value))

const railItems = computed<RailItem[]>(() => {
  const top = navItems.filter(
    (item) => !CALENDAR_CHILD_IDS.includes(item.id) && item.id !== 'settings',
  )
  const calendarChildren = navItems.filter((item) => CALENDAR_CHILD_IDS.includes(item.id))
  const settingsItem = navItems.find((item) => item.id === 'settings')

  return [
    ...top.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      badge: item.id === 'conduct' && inProgress.value.length > 0,
    })),
    {
      id: 'calendar-group',
      label: 'Open hours & calendar',
      icon: 'gear' as const,
      group: true,
      // Jump straight to My calendar when an assignment is waiting.
      defaultChildId: hasUnreadAssignment.value ? 'my-calendar' : 'calendar-connections',
      childIds: [...CALENDAR_CHILD_IDS],
      badge: hasUnreadAssignment.value,
    },
    ...calendarChildren.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      child: true,
      badge: item.id === 'my-calendar' && hasUnreadAssignment.value,
    })),
    ...(settingsItem
      ? [
          {
            id: settingsItem.id,
            label: settingsItem.label,
            icon: settingsItem.icon,
          },
        ]
      : []),
  ]
})

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

const settingsStore = useSettingsStore()
const centreName = computed(
  () => String(settingsStore.settings['center.name'] || 'LectiHub'),
)

onMounted(async () => {
  await Promise.allSettled([
    classesStore.fetchMine(),
    classesStore.fetchHistory(),
    lessonReportsStore.fetchMine(),
    notificationsStore.fetchMine(),
    calendarStore.fetchMine(),
    availabilityStore.fetchMine(),
    settingsStore.fetchPublic(),
  ])
})
</script>

<style scoped>
.conduct-workspace {
  display: grid;
  gap: 0.85rem;
}

.conduct-banners {
  display: grid;
  gap: 0.55rem;
}

.conduct-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}

.conduct-columns > :deep(.panel) {
  height: 100%;
  min-width: 0;
}

@media (max-width: 900px) {
  .conduct-columns {
    grid-template-columns: 1fr;
  }
}
</style>
