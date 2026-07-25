<template>
  <div class="dashboard">
    <div class="atmosphere" aria-hidden="true" />

    <header class="topbar dash-topbar">
      <div class="topbar-brand">
        <p class="brand">LectiHub</p>
        <p class="greeting">Admin review workspace</p>
      </div>

      <nav class="dash-nav" aria-label="Admin dashboard sections">
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
        <p class="eyebrow">Admin</p>
        <h1>Center operations</h1>
        <p>{{ activeIntro }}</p>
      </section>

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
            <p>Each booked slot is its own request. Assign a teacher to confirm that class.</p>
          </div>
        </div>

        <section class="review-workspace">
          <aside class="review-sidebar" aria-label="Pending scheduling requests">
            <div class="brand-block">
              <p class="kicker">Queue</p>
              <h2>Pending</h2>
              <p class="side-copy">Each item is one booked class slot waiting for a teacher.</p>
            </div>

            <p v-if="loadingRequests" class="hint side-hint">Loading requests…</p>
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
                    <span class="status">{{ request.status }}</span>
                  </div>
                  <p>
                    {{
                      request.slots[0]
                        ? `${formatDate(request.slots[0].preferredDate)} · ${formatSlot(request.slots[0].timeSlot)}`
                        : 'Class slot'
                    }}
                  </p>
                  <time>{{ formatDateTime(request.createdAt) }}</time>
                </button>
              </li>
            </ul>
          </aside>

          <div class="review-main">
            <header class="main-head">
              <div>
                <p class="kicker">Review</p>
                <h3>{{ selected?.request.student?.fullName || 'Request review' }}</h3>
                <p class="main-copy">
                  {{
                    selected
                      ? 'Assign an available teacher to confirm this booked class slot.'
                      : 'Select a booked slot from the sidebar to begin.'
                  }}
                </p>
              </div>
              <p v-if="requests.length" class="queue-count">{{ requests.length }} in queue</p>
            </header>

            <p v-if="loadingReview" class="hint">Loading availability…</p>
            <div v-else-if="!selected" class="empty-state">
              <p class="empty-title">No request selected</p>
              <p class="hint">Choose a booked slot from the left to assign a teacher.</p>
            </div>

            <div v-else class="review">
              <div class="student-block">
                <p>@{{ selected.request.student?.username }} · {{ selected.request.student?.email }}</p>
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
                    selected.request.assignedSlot
                      ? `${formatDate(selected.request.assignedSlot.preferredDate)} · ${formatSlot(selected.request.assignedSlot.timeSlot)}`
                      : 'selected slot'
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
                  Ranked by availability, workload, subject expertise, and student remarks.
                </p>

                <label for="assign-slot">Class slot</label>
                <select id="assign-slot" v-model="selectedSlotId">
                  <option
                    v-for="slot in selected.request.slots"
                    :key="slot.id"
                    :value="slot.id"
                  >
                    {{ formatDate(slot.preferredDate) }} · {{ formatSlot(slot.timeSlot) }}
                  </option>
                </select>

                <ul class="candidate-list">
                  <li
                    v-for="teacher in selected.teacherCandidates"
                    :key="teacher.id"
                    :class="{ disabled: !isTeacherFreeForSelectedSlot(teacher) }"
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
                        :disabled="assigning || !isTeacherFreeForSelectedSlot(teacher)"
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

              <div class="summary">
                <p>
                  <strong>{{ selected.fullyAvailableTeachers.length }}</strong>
                  teacher(s) free for this slot
                  <span class="muted">· {{ selected.teacherCount }} total teachers</span>
                </p>
                <ul v-if="selected.fullyAvailableTeachers.length" class="teacher-chips">
                  <li v-for="teacher in selected.fullyAvailableTeachers" :key="teacher.id">
                    {{ teacher.fullName }}
                  </li>
                </ul>
                <p v-else class="hint">No teacher is free for this booked slot.</p>
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
            <p>Teacher reports on the left. Student feedback on the right — reviewed side by side.</p>
          </div>
        </div>
        <div class="records-workspace">
          <LessonReportsPanel
            title="Lesson reports"
            subtitle="What teachers submitted after each class."
            empty-text="Reports appear here once a teacher completes a lesson write-up."
            :items="lessonReports"
            :loading="loadingReports"
            show-teacher
            show-student
          />
          <StudentFeedbackPanel
            title="Student feedback"
            subtitle="How students rated the lesson and learning experience."
            empty-text="Feedback appears here after a student responds to a lesson report."
            :items="studentFeedback"
            :loading="loadingFeedback"
            show-teacher
            show-student
          />
        </div>
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import {
  useAdminScheduleStore,
  type TeacherCandidate,
} from '../stores/adminSchedule'
import {
  useNotificationsStore,
  type AppNotification,
} from '../stores/notifications'
import { useLessonReportsStore } from '../stores/lessonReports'
import { useStudentFeedbackStore } from '../stores/studentFeedback'
import { useAdminMonitoringStore } from '../stores/adminMonitoring'
import NotificationsPanel from '../components/NotificationsPanel.vue'
import LessonReportsPanel from '../components/LessonReportsPanel.vue'
import StudentFeedbackPanel from '../components/StudentFeedbackPanel.vue'
import AdminMonitoringPanel from '../components/AdminMonitoringPanel.vue'
import AdminUsersPanel from '../components/AdminUsersPanel.vue'

const authStore = useAuthStore()
const adminStore = useAdminScheduleStore()
const notificationsStore = useNotificationsStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const monitoringStore = useAdminMonitoringStore()
const router = useRouter()

const {
  requests,
  selected,
  loadingRequests,
  loadingReview,
  assigning,
  error,
} = storeToRefs(adminStore)
const { loading: loadingReports, reports: lessonReports } = storeToRefs(lessonReportsStore)
const { loading: loadingFeedback, feedback: studentFeedback } = storeToRefs(studentFeedbackStore)
const {
  overview: monitoringOverview,
  loading: loadingMonitoring,
  error: monitoringError,
} = storeToRefs(monitoringStore)

const selectedSlotId = ref<number | null>(null)
const successMessage = ref('')
const errorMessage = ref('')

type AdminSection = 'review' | 'inbox' | 'records' | 'monitoring' | 'users'

const navItems: { id: AdminSection; label: string; intro: string }[] = [
  {
    id: 'review',
    label: 'Review & assign',
    intro: 'Each booked slot is its own class. Assign a teacher to confirm it.',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    intro: 'New scheduling requests and system alerts.',
  },
  {
    id: 'records',
    label: 'Reports & feedback',
    intro: 'Teacher reports on the left. Student feedback on the right — reviewed side by side.',
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    intro: 'Sidebar sections for overview, operations, teachers, and recent activity.',
  },
  {
    id: 'users',
    label: 'Users',
    intro: 'Use the sidebar to create teachers or browse the account directory.',
  },
]

const activeSection = ref<AdminSection>('review')

const activeIntro = computed(
  () => navItems.find((item) => item.id === activeSection.value)?.intro ?? '',
)

function setSection(section: AdminSection) {
  activeSection.value = section
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(
  () => selected.value?.request.id,
  () => {
    successMessage.value = ''
    errorMessage.value = ''
    selectedSlotId.value = selected.value?.request.slots[0]?.id ?? null
  },
)

function formatSlot(slot: string) {
  return slot.replace('-', ' – ')
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

function isTeacherFreeForSelectedSlot(teacher: TeacherCandidate) {
  if (!selectedSlotId.value) return false
  return teacher.freeSlots.some((slot) => slot.id === selectedSlotId.value)
}

async function openRequest(id: number) {
  successMessage.value = ''
  errorMessage.value = ''
  await adminStore.fetchRequestReview(id)
}

async function openFromNotification(item: AppNotification) {
  if (item.relatedRequestId) {
    activeSection.value = 'review'
    await openRequest(item.relatedRequestId)
  }
}

async function assign(teacherId: number) {
  if (!selected.value || !selectedSlotId.value) return
  successMessage.value = ''
  errorMessage.value = ''
  try {
    const result = await adminStore.assignTeacher(
      selected.value.request.id,
      teacherId,
      selectedSlotId.value,
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

onMounted(async () => {
  await Promise.all([
    monitoringStore.fetchOverview(),
    adminStore.fetchPendingRequests(),
    notificationsStore.fetchMine(),
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
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

.queue-count {
  color: var(--lh-warm);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
  margin-top: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(242, 183, 5, 0.28);
  background: var(--lh-warm-soft);
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
  max-height: min(52vh, 28rem);
  overflow: auto;
  padding-right: 0.15rem;
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
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
  padding: 0.15rem 0.4rem;
  border-radius: 0.35rem;
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

.records-workspace {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: stretch;
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
  .review-workspace,
  .records-workspace {
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
