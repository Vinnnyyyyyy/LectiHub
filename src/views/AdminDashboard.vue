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
      role-label="Admin"
      @select="setSection($event as AdminSection)"
      @logout="handleLogout"
    />

    <div class="dashboard-main">
      <header class="page-head">
        <section class="intro">
          <p class="eyebrow">Admin</p>
          <h1>Center operations</h1>
          <p>{{ activeIntro }}</p>
        </section>
      </header>

      <main class="content">

      <section
        v-show="activeSection === 'review'"
        id="panel-review"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-review"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="admin-review">Review &amp; assign</h2>
            <p>Work the pending queue, or open past reviews from the sidebar.</p>
          </div>
        </div>

        <section class="review-workspace">
          <aside class="review-sidebar" aria-label="Review sections">
            <div class="brand-block">
              <p class="kicker">Review</p>
              <h2>Assign</h2>
              <p class="side-copy">Pending sessions and previously decided reviews.</p>
            </div>

            <nav class="side-nav" role="tablist" aria-orientation="vertical">
              <button
                type="button"
                role="tab"
                class="side-link"
                :class="{ active: reviewView === 'queue' }"
                :aria-selected="reviewView === 'queue'"
                @click="reviewView = 'queue'"
              >
                <span class="side-label">Queue</span>
                <span class="side-badge">{{ requests.length }}</span>
              </button>
              <button
                type="button"
                role="tab"
                class="side-link"
                :class="{ active: reviewView === 'past' }"
                :aria-selected="reviewView === 'past'"
                @click="reviewView = 'past'"
              >
                <span class="side-label">Past reviews</span>
                <span class="side-badge">{{ pastRequests.length }}</span>
              </button>
            </nav>

            <p class="nav-group">{{ reviewView === 'queue' ? 'Waiting' : 'History' }}</p>

            <template v-if="reviewView === 'queue'">
              <p v-if="loadingRequests" class="hint side-hint">Loading queue…</p>
              <p v-else-if="!requests.length" class="hint side-hint">No pending requests right now.</p>
              <ul v-else class="request-list side-list">
                <li v-for="request in requests" :key="request.id">
                  <button
                    type="button"
                    class="request-btn"
                    :class="{ active: selected?.request.id === request.id }"
                    @click="openRequest(request.id)"
                  >
                    <div class="request-top">
                      <strong>{{ request.student?.fullName || 'Student' }}</strong>
                      <span
                        class="status"
                        :class="request.source === 'free_trial' ? 'trial' : 'pending'"
                      >
                        {{ request.source === 'free_trial' ? 'free trial' : request.status }}
                      </span>
                    </div>
                    <p>
                      {{
                        request.slots.length
                          ? `${formatDate(request.slots[0].preferredDate)} · ${formatRequestWindow(request.slots)}`
                          : 'Class session'
                      }}
                    </p>
                    <time>{{ formatDateTime(request.createdAt) }}</time>
                  </button>
                </li>
              </ul>
            </template>

            <template v-else>
              <p v-if="loadingPast" class="hint side-hint">Loading past reviews…</p>
              <p v-else-if="!pastRequests.length" class="hint side-hint">No past reviews yet.</p>
              <ul v-else class="request-list side-list">
                <li v-for="request in pastRequests" :key="request.id">
                  <button
                    type="button"
                    class="request-btn"
                    :class="{ active: selected?.request.id === request.id }"
                    @click="openRequest(request.id)"
                  >
                    <div class="request-top">
                      <strong>{{ request.student?.fullName || 'Student' }}</strong>
                      <span
                        class="status"
                        :class="request.source === 'free_trial' ? 'trial' : request.status"
                      >
                        {{ request.source === 'free_trial' ? 'free trial' : request.status }}
                      </span>
                    </div>
                    <p>
                      {{
                        request.assignedTeacher
                          ? request.assignedTeacher.fullName
                          : request.slots.length
                            ? `${formatDate(request.slots[0].preferredDate)} · ${formatRequestWindow(request.slots)}`
                            : 'Past review'
                      }}
                    </p>
                    <time>{{ formatDateTime(request.assignedAt || request.createdAt) }}</time>
                  </button>
                </li>
              </ul>
            </template>
          </aside>

          <div class="review-main">
            <header class="main-head">
              <div>
                <p class="kicker">{{ reviewMainKicker }}</p>
                <h3>{{ selected?.request.student?.fullName || reviewMainTitle }}</h3>
                <p class="main-copy">{{ reviewMainCopy }}</p>
              </div>
              <p v-if="reviewView === 'queue' && requests.length" class="queue-count">
                {{ requests.length }} in queue
              </p>
              <p v-else-if="reviewView === 'past' && pastRequests.length" class="past-count">
                {{ pastRequests.length }} reviewed
              </p>
            </header>

            <p v-if="loadingReview" class="hint">Loading availability…</p>
            <div v-else-if="!selected" class="empty-state">
              <p class="empty-title">
                {{ reviewView === 'queue' ? 'No request selected' : 'No past review selected' }}
              </p>
              <p class="hint">
                {{
                  reviewView === 'queue'
                    ? 'Choose a pending booking from the left to assign a teacher.'
                    : 'Choose a past review from the left to inspect the decision.'
                }}
              </p>
            </div>

            <div v-else class="review">
              <div class="student-block">
                <p>@{{ selected.request.student?.username }} · {{ selected.request.student?.email }}</p>
                <p v-if="selected.request.source === 'free_trial'" class="preference-note">
                  Free trial
                  <template v-if="selected.request.program">
                    · {{ selected.request.program }}
                  </template>
                  <template v-if="selected.request.entityType">
                    · {{ selected.request.entityType === 'company' ? 'Company' : 'Individual' }}
                  </template>
                  <template v-if="selected.request.preferredMeetingProvider">
                    · {{ formatMeetingProvider(selected.request.preferredMeetingProvider) }}
                  </template>
                </p>
                <p v-if="selected.request.remarks" class="remarks">
                  Remarks: {{ selected.request.remarks }}
                </p>
                <p
                  v-if="selected.preferredSubjects.length"
                  class="preference-note"
                >
                  Detected preference:
                  {{ selected.preferredSubjects.join(', ') }}
                </p>
              </div>

              <div
                v-if="selected.request.status === 'approved' && selected.request.assignedTeacher"
                class="assigned-banner"
              >
                <strong>Approved</strong>
                <p>
                  {{ selected.request.assignedTeacher.fullName }} assigned for
                  {{
                    selected.request.slots.length
                      ? `${formatDate(selected.request.slots[0].preferredDate)} · ${formatRequestWindow(selected.request.slots)}`
                      : 'the class block'
                  }}
                </p>
              </div>

              <div v-if="selected.confirmedSchedule" class="confirmed-schedule">
                <h4>Confirmed class schedule</h4>
                <p><strong>{{ selected.confirmedSchedule.title }}</strong></p>
                <p>
                  {{ formatDate(selected.confirmedSchedule.classDate) }}
                  ·
                  {{
                    formatTimeRange(
                      selected.confirmedSchedule.startTime,
                      selected.confirmedSchedule.endTime,
                      selected.confirmedSchedule.timeSlot,
                    )
                  }}
                  · {{ selected.confirmedSchedule.durationMinutes }} minutes
                </p>
                <p v-if="selected.confirmedSchedule.subject">
                  Subject: {{ selected.confirmedSchedule.subject }}
                </p>
                <p v-if="selected.confirmedSchedule.meetingInfo">
                  {{ selected.confirmedSchedule.meetingInfo }}
                </p>
                <a
                  v-if="selected.confirmedSchedule.meetingLink"
                  class="meet-link"
                  :href="selected.confirmedSchedule.meetingLink"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open meeting link
                </a>
              </div>

              <div v-if="selected.request.status === 'pending'" class="assignment">
                <div class="section-head">
                  <h4>Assign teacher</h4>
                </div>
                <p class="hint assign-hint">
                  One teacher covers the full block
                  ({{ formatRequestWindow(selected.request.slots) }},
                  {{ requestDurationMinutes(selected.request.slots) }} minutes).
                  Ranked by availability, workload, subject expertise, and remarks.
                </p>

                <p class="class-block">
                  <strong>Class block</strong>
                  {{ formatDate(selected.request.slots[0].preferredDate) }}
                  · {{ formatRequestWindow(selected.request.slots) }}
                  · {{ requestDurationMinutes(selected.request.slots) }} minutes
                </p>

                <ul class="candidate-list">
                  <li
                    v-for="teacher in selected.teacherCandidates"
                    :key="teacher.id"
                    :class="{ disabled: !teacher.fullyAvailable }"
                  >
                    <div class="candidate-top">
                      <div>
                        <strong>{{ teacher.fullName }}</strong>
                        <p class="muted">
                          {{ teacher.subjectExpertise || 'General' }}
                          · workload {{ teacher.workload }}
                          · score {{ teacher.suitabilityScore }}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="assign-btn"
                        :disabled="assigning || !teacher.fullyAvailable"
                        @click="assign(teacher.id)"
                      >
                        {{ assigning ? 'Assigning...' : 'Assign' }}
                      </button>
                    </div>
                    <ul class="reason-list">
                      <li v-for="reason in teacher.matchReasons" :key="`${teacher.id}-${reason}`">
                        {{ reason }}
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>

              <template v-if="selected.request.status === 'pending'">
                <div class="summary">
                  <p>
                    <strong>{{ selected.fullyAvailableTeachers.length }}</strong>
                    teacher(s) free for the full class block
                    <span class="muted">· {{ selected.teacherCount }} total teachers</span>
                  </p>
                  <ul v-if="selected.fullyAvailableTeachers.length" class="teacher-chips">
                    <li v-for="teacher in selected.fullyAvailableTeachers" :key="teacher.id">
                      {{ teacher.fullName }}
                    </li>
                  </ul>
                  <p v-else class="hint">No teacher is free for the full booked session.</p>
                </div>

                <div
                  v-for="slot in selected.slotAvailability"
                  :key="`${slot.preferredDate}-${slot.timeSlot}`"
                  class="slot-card"
                >
                  <h4>{{ formatDate(slot.preferredDate) }} · {{ formatSlot(slot.timeSlot) }}</h4>

                  <p class="field-label">Available teachers</p>
                  <ul v-if="slot.availableTeachers.length" class="teacher-list">
                    <li v-for="teacher in slot.availableTeachers" :key="teacher.id">
                      <span>
                        {{ teacher.fullName }}
                        <span class="muted">
                          · {{ teacher.subjectExpertise || 'General' }}
                          · load {{ teacher.workload ?? 0 }}
                        </span>
                      </span>
                    </li>
                  </ul>
                  <p v-else class="hint">No teachers available for this slot.</p>

                  <template v-if="slot.unavailableTeachers.length">
                    <p class="field-label conflict-label">Unavailable (schedule conflict)</p>
                    <ul class="teacher-list conflicts">
                      <li v-for="teacher in slot.unavailableTeachers" :key="teacher.id">
                        <span>
                          {{ teacher.fullName }}
                          <span class="muted">@{{ teacher.username }}</span>
                        </span>
                        <span class="conflict">
                          Busy: {{ teacher.conflict.title }}
                        </span>
                      </li>
                    </ul>
                  </template>
                </div>
              </template>
            </div>

            <p v-if="successMessage" class="success" role="status">{{ successMessage }}</p>
            <p v-if="errorMessage || error" class="error" role="alert">
              {{ errorMessage || error }}
            </p>
          </div>
        </section>
      </section>

      <section
        v-show="activeSection === 'inbox'"
        id="panel-inbox"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-inbox"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="admin-inbox">Inbox</h2>
            <p>New scheduling requests and system alerts.</p>
          </div>
        </div>
        <NotificationsPanel
          subtitle="New student scheduling requests appear here for review."
          empty-text="No notifications yet."
          @select="openFromNotification"
        />
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
            <h2 id="admin-records">Reports &amp; feedback</h2>
            <p>Each lesson teacher report and student feedback stay aligned in the same row.</p>
          </div>
        </div>
        <AdminReportsFeedbackWorkspace
          :reports="lessonReports"
          :feedback="studentFeedback"
          :loading="loadingReports || loadingFeedback"
        />
      </section>

      <section
        v-show="activeSection === 'monitoring'"
        id="panel-monitoring"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-monitoring"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="admin-monitor">Monitoring</h2>
            <p>Sidebar sections for overview, operations, teachers, and recent activity.</p>
          </div>
        </div>
        <AdminMonitoringPanel
          :overview="monitoringOverview"
          :loading="loadingMonitoring"
          :error="monitoringError"
          @refresh="refreshMonitoring"
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
            <h2 id="admin-payments">Payments</h2>
            <p>Student payment invoice receipts — record, confirm, or void.</p>
          </div>
        </div>
        <AdminPaymentReceiptsPanel />
      </section>

      <section
        v-show="activeSection === 'users'"
        id="panel-users"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-users"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="admin-users">Users</h2>
            <p>Use the sidebar to create teachers or browse the account directory.</p>
          </div>
        </div>
        <AdminUsersPanel />
      </section>

      <section
        v-show="activeSection === 'courses'"
        id="panel-courses"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-courses"
      >
        <CoursesView />
      </section>

      <section
        v-show="activeSection === 'announcements'"
        id="panel-announcements"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-announcements"
      >
        <AnnouncementsView />
      </section>

      <section
        v-show="activeSection === 'audit'"
        id="panel-audit"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-audit"
      >
        <AuditView />
      </section>

      <section
        v-show="isSettingsSection"
        id="panel-settings"
        class="dash-section"
        role="tabpanel"
        aria-labelledby="tab-settings"
      >
        <div class="dash-section-label">
          <div>
            <h2 id="tab-settings">{{ activeSettingsLabel }}</h2>
            <p>{{ activeIntro }}</p>
          </div>
        </div>
        <SettingsView
          :panel="settingsPanel"
          @open-payments="setSection('payments')"
        />
      </section>
      </main>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import AppRail, { type RailItem } from '../components/AppRail.vue'
import { initialsFrom } from '../utils/initials'
import { useAdminScheduleStore } from '../stores/adminSchedule'
import {
  useNotificationsStore,
  type AppNotification,
} from '../stores/notifications'
import { useLessonReportsStore } from '../stores/lessonReports'
import { useStudentFeedbackStore } from '../stores/studentFeedback'
import { useAdminMonitoringStore } from '../stores/adminMonitoring'
import { useSettingsStore } from '../stores/settings'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import AdminReportsFeedbackWorkspace from '../components/AdminReportsFeedbackWorkspace.vue'
import AdminMonitoringPanel from '../components/AdminMonitoringPanel.vue'
import AdminUsersPanel from '../components/AdminUsersPanel.vue'
import AdminPaymentReceiptsPanel from '../components/AdminPaymentReceiptsPanel.vue'
import AnnouncementsView from './admin/AnnouncementsView.vue'
import AuditView from './admin/AuditView.vue'
import CoursesView from './admin/CoursesView.vue'
import SettingsView, { type SettingsPanel } from './admin/SettingsView.vue'

const authStore = useAuthStore()
const adminStore = useAdminScheduleStore()
const notificationsStore = useNotificationsStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const monitoringStore = useAdminMonitoringStore()
const router = useRouter()

const {
  requests,
  pastRequests,
  selected,
  loadingRequests,
  loadingPast,
  loadingReview,
  assigning,
  error,
} = storeToRefs(adminStore)
const { loading: loadingReports, reports: lessonReports } = storeToRefs(lessonReportsStore)
const { loading: loadingFeedback, feedback: studentFeedback } = storeToRefs(studentFeedbackStore)
const { notifications } = storeToRefs(notificationsStore)
const {
  overview: monitoringOverview,
  loading: loadingMonitoring,
  error: monitoringError,
} = storeToRefs(monitoringStore)

const successMessage = ref('')
const errorMessage = ref('')
const reviewView = ref<'queue' | 'past'>('queue')

type AdminSection =
  | 'review'
  | 'inbox'
  | 'records'
  | 'monitoring'
  | 'payments'
  | 'users'
  | 'courses'
  | 'announcements'
  | 'audit'
  | 'settings-scheduling'
  | 'settings-reminders'
  | 'settings-meetings'
  | 'settings-centre'

/** Unread student/teacher alerts → gold dots on the matching sidebar items. */
const SECTION_NOTIF_TYPES: Partial<Record<AdminSection, readonly string[]>> = {
  review: ['schedule_request'],
  inbox: [
    'schedule_request',
    'lesson_report',
    'student_feedback',
    'attendance_alert',
    'payment_receipt',
  ],
  records: ['lesson_report', 'student_feedback', 'attendance_alert'],
  payments: ['payment_receipt'],
}

function sectionHasUnread(section: AdminSection): boolean {
  const types = SECTION_NOTIF_TYPES[section]
  if (!types?.length) return false
  return notifications.value.some((item) => !item.isRead && types.includes(item.type))
}

function sectionForNotification(type: string): AdminSection {
  if (type === 'schedule_request') return 'review'
  if (type === 'lesson_report' || type === 'student_feedback' || type === 'attendance_alert') {
    return 'records'
  }
  if (type === 'payment_receipt') return 'payments'
  return 'inbox'
}

async function clearSectionNotifications(section: AdminSection) {
  const types = SECTION_NOTIF_TYPES[section]
  if (!types?.length) return
  const unread = notificationsStore.notifications.filter(
    (item) => !item.isRead && types.includes(item.type),
  )
  await Promise.allSettled(unread.map((item) => notificationsStore.markRead(item.id)))
}

const SETTINGS_CHILD_IDS: AdminSection[] = [
  'settings-scheduling',
  'settings-reminders',
  'settings-meetings',
  'settings-centre',
]

const SETTINGS_PANEL_BY_SECTION: Record<(typeof SETTINGS_CHILD_IDS)[number], SettingsPanel> = {
  'settings-scheduling': 'scheduling',
  'settings-reminders': 'reminders',
  'settings-meetings': 'meetings',
  'settings-centre': 'centre',
}

const reviewMainKicker = computed(() => {
  if (!selected.value) return reviewView.value === 'queue' ? 'Queue' : 'History'
  return selected.value.request.status === 'pending' ? 'Assign' : 'Past review'
})

const reviewMainTitle = computed(() =>
  reviewView.value === 'queue' ? 'Request review' : 'Past review',
)

const reviewMainCopy = computed(() => {
  if (!selected.value) {
    return reviewView.value === 'queue'
      ? 'Select a pending booking from the sidebar to begin.'
      : 'Select a past review to see who was assigned and when.'
  }
  if (selected.value.request.status === 'pending') {
    return 'Assign one teacher who is free for the full class block.'
  }
  return 'This booking was already reviewed. Details below are read-only.'
})

const navItems: {
  id: AdminSection
  label: string
  intro: string
  icon: RailItem['icon']
}[] = [
  {
    id: 'monitoring',
    label: 'Overview',
    intro: 'Sidebar sections for overview, operations, teachers, and recent activity.',
    icon: 'grid',
  },
  {
    id: 'review',
    label: 'Review & assign',
    intro: 'Pending queue and past reviews — assign teachers, then revisit decisions.',
    icon: 'list',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    intro: 'New scheduling requests and system alerts.',
    icon: 'calendar',
  },
  {
    id: 'users',
    label: 'People',
    intro: 'Use the sidebar to create teachers or browse the account directory.',
    icon: 'people',
  },
  {
    id: 'courses',
    label: 'Courses & materials',
    intro: 'Upload/edit/delete materials, assign teachers and students. Teachers view assigned courses; students download with a 3/page quota.',
    icon: 'book',
  },
  {
    id: 'records',
    label: 'Reports & feedback',
    intro: 'Each lesson teacher report and student feedback stay aligned in the same row.',
    icon: 'chart',
  },
  {
    id: 'announcements',
    label: 'Announcements',
    intro: 'Compose centre-wide or targeted announcements.',
    icon: 'megaphone',
  },
  {
    id: 'audit',
    label: 'Audit log',
    intro: 'Review recent admin and system activity.',
    icon: 'clock',
  },
  {
    id: 'payments',
    label: 'Payments',
    intro: 'Student payment invoice receipts — record, confirm, or void.',
    icon: 'chart',
  },
  {
    id: 'settings-scheduling',
    label: 'Scheduling rules',
    intro: 'Slot length, opening hours, lunch gap, and booking notice.',
    icon: 'calendar',
  },
  {
    id: 'settings-reminders',
    label: 'Reminders & notifications',
    intro: 'Class reminders and who gets notified when decisions happen.',
    icon: 'megaphone',
  },
  {
    id: 'settings-meetings',
    label: 'Meeting providers',
    intro: 'Enable platforms and choose the default for new classes.',
    icon: 'people',
  },
  {
    id: 'settings-centre',
    label: 'Centre profile & records',
    intro: 'Centre name, time zone, term dates, and audit retention.',
    icon: 'book',
  },
]

const activeSection = ref<AdminSection>('review')

const isSettingsSection = computed(() => SETTINGS_CHILD_IDS.includes(activeSection.value))

const settingsPanel = computed<SettingsPanel>(() =>
  isSettingsSection.value
    ? SETTINGS_PANEL_BY_SECTION[activeSection.value as (typeof SETTINGS_CHILD_IDS)[number]]
    : 'scheduling',
)

const activeSettingsLabel = computed(
  () => navItems.find((item) => item.id === activeSection.value)?.label ?? 'System settings',
)

const activeIntro = computed(
  () => navItems.find((item) => item.id === activeSection.value)?.intro ?? '',
)

const displayName = computed(() => authStore.fullName || authStore.username || 'admin')
const initials = computed(() => initialsFrom(displayName.value))

const railItems = computed<RailItem[]>(() => {
  const top = navItems.filter((item) => !SETTINGS_CHILD_IDS.includes(item.id))
  const settingsChildren = navItems.filter((item) => SETTINGS_CHILD_IDS.includes(item.id))

  return [
    ...top.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      badge:
        (item.id === 'review' && (requests.value.length > 0 || sectionHasUnread('review'))) ||
        (item.id === 'inbox' && sectionHasUnread('inbox')) ||
        (item.id === 'records' && sectionHasUnread('records')) ||
        (item.id === 'payments' && sectionHasUnread('payments')),
    })),
    {
      id: 'settings-group',
      label: 'System settings',
      icon: 'gear' as const,
      group: true,
      defaultChildId: 'settings-scheduling',
      childIds: [...SETTINGS_CHILD_IDS],
    },
    ...settingsChildren.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      child: true,
    })),
  ]
})

async function setSection(section: AdminSection) {
  activeSection.value = section
  const main = document.querySelector('.dashboard-main')
  if (main instanceof HTMLElement) {
    main.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Clear gold dots for the section the admin just opened.
  if (section === 'review' || section === 'inbox' || section === 'records' || section === 'payments') {
    await clearSectionNotifications(section)
  }
  if (section === 'records') {
    await Promise.allSettled([
      lessonReportsStore.fetchMine(),
      studentFeedbackStore.fetchMine(),
    ])
  }
  if (section === 'review') {
    await Promise.allSettled([adminStore.fetchReviewLists()])
  }
}

watch(
  () => selected.value?.request.id,
  () => {
    successMessage.value = ''
    errorMessage.value = ''
  },
)

function formatSlot(slot: string) {
  return slot.replace('-', ' – ')
}

function formatRequestWindow(slots: { preferredDate: string; timeSlot: string }[]) {
  if (!slots.length) return ''
  const sorted = [...slots].sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
  const start = sorted[0].timeSlot.split('-')[0]
  const end = sorted[sorted.length - 1].timeSlot.split('-')[1]
  return `${start} – ${end}`
}

function requestDurationMinutes(slots: { timeSlot: string }[]) {
  if (!slots.length) return 0
  const sorted = [...slots].sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
  const start = sorted[0].timeSlot.split('-')[0]
  const end = sorted[sorted.length - 1].timeSlot.split('-')[1]
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }
  return Math.max(0, toMinutes(end) - toMinutes(start))
}

function formatMeetingProvider(value?: string | null) {
  const labels: Record<string, string> = {
    zoom: 'Zoom',
    google_meet: 'Google Meet',
    digital_samba: 'Digital Samba',
    jitsi: 'Jitsi',
  }
  if (!value) return 'Video platform TBD'
  return labels[value] || value
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(value: string) {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
  timeSlot: string,
) {
  if (startTime && endTime) return `${startTime} – ${endTime}`
  return formatSlot(timeSlot)
}

async function openRequest(id: number) {
  successMessage.value = ''
  errorMessage.value = ''
  await adminStore.fetchRequestReview(id)
}

async function openFromNotification(item: AppNotification) {
  const target = sectionForNotification(item.type)
  if (target === 'review' && item.relatedRequestId) {
    activeSection.value = 'review'
    reviewView.value = 'queue'
    await clearSectionNotifications('review')
    await openRequest(item.relatedRequestId)
    if (selected.value && selected.value.request.status !== 'pending') {
      reviewView.value = 'past'
    }
    return
  }
  await setSection(target)
}

async function assign(teacherId: number) {
  if (!selected.value) return
  successMessage.value = ''
  errorMessage.value = ''
  try {
    const result = await adminStore.assignTeacher(
      selected.value.request.id,
      teacherId,
      selected.value.request.slots[0]?.id ?? null,
    )
    const emailNote = result.emails?.enabled
      ? ' Confirmation emails were also sent (if recipients have email addresses).'
      : ''
    const calendarNote = result.calendarSync
      ? ' Calendars updated for student and teacher.'
      : ''
    successMessage.value =
      (result.message ||
        `Assigned ${result.request.assignedTeacher?.fullName || 'teacher'} and approved the request.`) +
      calendarNote +
      emailNote
    reviewView.value = 'past'
  } catch (err) {
    if (axios.isAxiosError(err)) {
      errorMessage.value = err.response?.data?.message || 'Could not assign teacher'
    } else {
      errorMessage.value = 'Could not assign teacher'
    }
  }
}

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}

async function refreshMonitoring() {
  await monitoringStore.fetchOverview()
}

const settingsStore = useSettingsStore()
const centreName = computed(
  () => String(settingsStore.settings['center.name'] || 'LectiHub'),
)

onMounted(async () => {
  await Promise.all([
    monitoringStore.fetchOverview(),
    adminStore.fetchReviewLists(),
    notificationsStore.fetchMine(),
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
    settingsStore.fetchAll().catch(() => settingsStore.fetchPublic()),
  ])
})
</script>

<style scoped>
/* Shell styles live in assets/dashboard.css */

.hint,
.muted,
p,
li,
button,
time,
strong {
  font-family: 'Manrope', sans-serif;
}

.text-btn,
.notice-btn {
  border: 1px solid var(--lh-line);
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
}

.request-btn {
  cursor: pointer;
  font: inherit;
}

.text-btn:hover {
  border-color: var(--lh-line-strong);
}

.slot-card h4,
.confirmed-schedule h4,
.assignment h4 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-accent);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.text-btn {
  border-radius: 0.55rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 700;
}

.review-workspace {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  min-height: 34rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  overflow: hidden;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
  animation: rise 0.45s ease both;
}

.review-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.15rem 0.9rem 1.1rem;
  border-right: 1px solid var(--lh-line);
  background: linear-gradient(180deg, rgba(36, 44, 54, 0.72), rgba(20, 25, 31, 0.35));
}

.brand-block h2,
.main-head h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-ink);
  margin: 0;
}

.brand-block h2 {
  font-size: 1.35rem;
  margin-top: 0.15rem;
}

.kicker {
  font-family: 'Manrope', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
  margin: 0;
}

.side-copy,
.main-copy,
.empty-title,
.queue-count {
  font-family: 'Manrope', sans-serif;
}

.side-copy,
.main-copy {
  margin-top: 0.4rem;
  color: var(--lh-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.side-hint {
  margin: 0.15rem 0.2rem 0;
}

.side-nav {
  display: grid;
  gap: 0.3rem;
}

.side-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.7rem;
  background: transparent;
  color: var(--lh-muted);
  padding: 0.65rem 0.7rem;
  text-align: left;
  cursor: pointer;
  font-family: 'Manrope', sans-serif;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.side-link:hover {
  background: rgba(231, 236, 239, 0.05);
  color: var(--lh-ink);
}

.side-link.active {
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.35);
  color: var(--lh-accent);
}

.side-label {
  font-size: 0.88rem;
  font-weight: 750;
}

.side-badge {
  min-width: 1.35rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: rgba(231, 236, 239, 0.08);
  color: var(--lh-faint);
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-family: 'Manrope', sans-serif;
}

.side-link.active .side-badge {
  background: rgba(126, 184, 164, 0.18);
  color: var(--lh-accent);
}

.nav-group {
  margin: 0.15rem 0 0 0.35rem;
  font-family: 'Manrope', sans-serif;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.review-main {
  min-width: 0;
  padding: 1.15rem 1.2rem 1.25rem;
  background:
    radial-gradient(ellipse 55% 40% at 100% 0%, rgba(126, 184, 164, 0.08), transparent 55%),
    rgba(14, 18, 22, 0.35);
}

.main-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.main-head h3 {
  font-size: 1.4rem;
  margin-top: 0.15rem;
}

.queue-count,
.past-count {
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
  margin-top: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  font-family: 'Manrope', sans-serif;
}

.queue-count {
  color: var(--lh-warm);
  border: 1px solid rgba(242, 183, 5, 0.28);
  background: var(--lh-warm-soft);
}

.past-count {
  color: var(--lh-accent);
  border: 1px solid rgba(126, 184, 164, 0.28);
  background: var(--lh-accent-soft);
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  border: 1px solid var(--lh-line);
  border-radius: 0.95rem;
  background: rgba(16, 20, 26, 0.35);
}

.empty-title {
  margin: 0;
  color: var(--lh-ink);
  font-weight: 750;
}

.notice-list,
.request-list,
.teacher-list,
.teacher-chips {
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.side-list {
  gap: 0.35rem;
  max-height: min(42vh, 22rem);
  overflow: auto;
  padding-right: 0.15rem;
  align-content: start;
}

.notice-btn,
.request-btn {
  width: 100%;
  text-align: left;
  border-radius: 0.7rem;
  padding: 0.65rem 0.7rem;
  display: grid;
  gap: 0.2rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--lh-ink);
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.request-btn:hover {
  background: rgba(231, 236, 239, 0.05);
}

.notice-list li.unread .notice-btn {
  border-color: rgba(126, 184, 164, 0.35);
  background: var(--lh-accent-soft);
}

.notice-btn span,
.request-btn p {
  color: var(--lh-muted);
  font-size: 0.84rem;
}

.request-btn.active {
  border-color: rgba(126, 184, 164, 0.35);
  background: var(--lh-accent-soft);
}

.request-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.status {
  text-transform: capitalize;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
  padding: 0.15rem 0.4rem;
  border-radius: 0.35rem;
}

.status.pending {
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
}

.status.trial {
  color: var(--lh-accent);
  background: var(--lh-accent-soft);
}

.status.approved {
  color: var(--lh-accent);
  background: var(--lh-accent-soft);
}

.status.rejected {
  color: var(--lh-danger);
  background: var(--lh-danger-soft);
}

.hint {
  color: var(--lh-faint);
  font-size: 0.9rem;
  font-style: italic;
}

.review {
  display: grid;
  gap: 1rem;
}

.student-block p,
.summary p {
  margin-top: 0.25rem;
  color: var(--lh-muted);
  font-size: 0.92rem;
}

.remarks,
.preference-note,
.assigned-banner,
.assignment {
  margin-top: 0.55rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.65rem;
  background: rgba(20, 25, 31, 0.72);
  border: 1px solid var(--lh-line);
}

.preference-note {
  color: var(--lh-warm);
  font-size: 0.88rem;
  font-weight: 600;
}

.assigned-banner,
.confirmed-schedule {
  border-color: rgba(126, 184, 164, 0.35);
  background: var(--lh-accent-soft);
}

.assigned-banner p,
.confirmed-schedule p {
  margin-top: 0.25rem;
  color: var(--lh-muted);
}

.confirmed-schedule {
  display: grid;
  gap: 0.2rem;
}

.confirmed-schedule h4 {
  font-size: 1.05rem;
  margin: 0 0 0.15rem;
}

.meet-link {
  margin-top: 0.35rem;
  color: var(--lh-accent);
  font-weight: 700;
  text-decoration: none;
  width: fit-content;
}

.meet-link:hover {
  text-decoration: underline;
}

.assignment {
  display: grid;
  gap: 0.55rem;
}

.assignment .section-head {
  margin-bottom: 0;
}

.assignment h4 {
  font-size: 1.1rem;
  margin: 0;
}

.assign-hint {
  margin: 0;
}

.class-block {
  margin: 0;
  padding: 0.7rem 0.8rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(126, 184, 164, 0.3);
  background: var(--lh-accent-soft);
  color: var(--lh-ink);
  font-size: 0.9rem;
  line-height: 1.45;
}

.class-block strong {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--lh-accent);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.assignment label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--lh-muted);
}

.assignment select {
  width: 100%;
  max-width: 24rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.65rem;
  border: 1px solid var(--lh-line-strong);
  background: var(--lh-input);
  color: var(--lh-ink);
  color-scheme: dark;
}

.candidate-list,
.reason-list {
  list-style: none;
  display: grid;
  gap: 0.55rem;
}

.candidate-list > li {
  padding: 0.75rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.7rem;
  background: rgba(16, 20, 26, 0.55);
}

.candidate-list > li.disabled {
  opacity: 0.55;
}

.candidate-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.assign-btn {
  border: none;
  border-radius: 0.6rem;
  padding: 0.55rem 0.8rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
  cursor: pointer;
  white-space: nowrap;
}

.assign-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reason-list {
  margin-top: 0.45rem;
  gap: 0.2rem;
}

.reason-list li {
  font-size: 0.82rem;
  color: var(--lh-muted);
}

.reason-list li::before {
  content: '· ';
  color: var(--lh-accent);
}

.success {
  margin-top: 0.75rem;
  color: var(--lh-accent);
  font-size: 0.9rem;
  font-weight: 600;
}

.summary {
  padding: 0.8rem 0.85rem;
  border-radius: 0.75rem;
  border: 1px solid var(--lh-line);
  background: rgba(20, 25, 31, 0.65);
}

.teacher-chips {
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  margin-top: 0.55rem;
}

.teacher-chips li {
  padding: 0.4rem 0.55rem;
  border-radius: 0.5rem;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
}

.slot-card {
  padding: 0.9rem 0.85rem;
  border-radius: 0.8rem;
  border: 1px solid var(--lh-line);
  background: rgba(20, 25, 31, 0.62);
}

.slot-card h4 {
  font-size: 1.05rem;
  margin-bottom: 0.55rem;
  color: var(--lh-ink);
}

.field-label {
  margin-top: 0.55rem;
  margin-bottom: 0.3rem;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--lh-muted);
}

.conflict-label {
  color: var(--lh-danger);
}

.teacher-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--lh-line);
  font-size: 0.9rem;
}

.teacher-list li:last-child {
  border-bottom: none;
}

.conflicts .conflict {
  color: var(--lh-danger);
  font-size: 0.8rem;
  font-weight: 600;
}

.muted {
  color: var(--lh-faint);
  font-weight: 500;
}

time {
  font-size: 0.78rem;
  color: var(--lh-faint);
}

.error {
  margin-top: 0.75rem;
  color: var(--lh-danger);
  font-size: 0.9rem;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .review-workspace {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .review-sidebar {
    border-right: none;
    border-bottom: 1px solid var(--lh-line);
  }

  .side-list {
    max-height: none;
  }
}
</style>
