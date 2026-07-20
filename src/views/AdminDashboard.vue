<template>
  <div class="dashboard">
    <div class="atmosphere" aria-hidden="true" />

    <header class="topbar">
      <div>
        <p class="brand">LectiHub</p>
        <p class="greeting">Admin review workspace</p>
      </div>
      <button type="button" class="logout" @click="handleLogout">Log out</button>
    </header>

    <main class="content">
      <section class="intro">
        <h1>Admin Dashboard</h1>
        <p>
          Review preferred schedules, compare teacher availability/workload/expertise, then assign
          the best fit to approve the request.
        </p>
      </section>

      <NotificationsPanel
        subtitle="New student scheduling requests appear here for review."
        empty-text="No notifications yet."
        @select="openFromNotification"
      />

      <div class="layout">
        <section class="panel requests-panel">
          <div class="section-head">
            <h2>Pending scheduling requests</h2>
          </div>

          <p v-if="loadingRequests" class="hint">Loading requests...</p>
          <p v-else-if="!requests.length" class="hint">No pending requests right now.</p>
          <ul v-else class="request-list">
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
                <p>{{ request.slots.length }} preferred slot(s)</p>
                <time>{{ formatDateTime(request.createdAt) }}</time>
              </button>
            </li>
          </ul>
        </section>

        <section class="panel review-panel">
          <div class="section-head">
            <h2>Request review</h2>
          </div>

          <p v-if="loadingReview" class="hint">Loading availability...</p>
          <p v-else-if="!selected" class="hint">
            Select a request to review the student’s preferred schedule and available teachers.
          </p>

          <div v-else class="review">
            <div class="student-block">
              <h3>{{ selected.request.student?.fullName }}</h3>
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
              <h3>Confirmed class schedule</h3>
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
                <h3>Assign teacher</h3>
              </div>
              <p class="hint assign-hint">
                Ranked by availability, workload, subject expertise, and student preference.
              </p>

              <label for="assign-slot">Class slot to book</label>
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
                teacher(s) free for every preferred slot
                <span class="muted">· {{ selected.teacherCount }} total teachers</span>
              </p>
              <ul v-if="selected.fullyAvailableTeachers.length" class="teacher-chips">
                <li v-for="teacher in selected.fullyAvailableTeachers" :key="teacher.id">
                  {{ teacher.fullName }}
                </li>
              </ul>
              <p v-else class="hint">No teacher is free across all preferred slots.</p>
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

              <p class="field-label conflict-label">Unavailable (schedule conflict)</p>
              <ul v-if="slot.unavailableTeachers.length" class="teacher-list conflicts">
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
              <p v-else class="hint">No conflicts for this slot.</p>
            </div>
          </div>

          <p v-if="successMessage" class="success" role="status">{{ successMessage }}</p>
          <p v-if="errorMessage || error" class="error" role="alert">
            {{ errorMessage || error }}
          </p>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
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
import NotificationsPanel from '../components/NotificationsPanel.vue'

const authStore = useAuthStore()
const adminStore = useAdminScheduleStore()
const notificationsStore = useNotificationsStore()
const router = useRouter()

const {
  requests,
  selected,
  loadingRequests,
  loadingReview,
  assigning,
  error,
} = storeToRefs(adminStore)

const selectedSlotId = ref<number | null>(null)
const successMessage = ref('')
const errorMessage = ref('')

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
    successMessage.value =
      (result.message ||
        `Assigned ${result.request.assignedTeacher?.fullName || 'teacher'} and approved the request.`) +
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

onMounted(async () => {
  await Promise.all([adminStore.fetchPendingRequests(), notificationsStore.fetchMine()])
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
}

.brand {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.45rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--lh-accent);
}

.greeting,
.hint,
.muted,
p,
li,
button,
time,
strong {
  font-family: 'Manrope', sans-serif;
}

.greeting {
  font-size: 0.92rem;
  color: var(--lh-muted);
  margin-top: 0.15rem;
}

.logout,
.text-btn,
.request-btn,
.notice-btn {
  border: 1px solid var(--lh-line);
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
}

.logout {
  font-size: 0.88rem;
  font-weight: 700;
  padding: 0.55rem 0.9rem;
  border-radius: 0.65rem;
}

.logout:hover,
.text-btn:hover {
  border-color: var(--lh-line-strong);
}

.content {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1rem 1.5rem 2.5rem;
  display: grid;
  gap: 1rem;
}

.intro h1,
.panel h2,
.review h3,
.slot-card h4 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-accent);
}

.intro h1 {
  font-size: clamp(1.7rem, 3vw, 2.2rem);
  letter-spacing: -0.03em;
  color: var(--lh-ink);
}

.intro p {
  margin-top: 0.4rem;
  max-width: 40rem;
  color: var(--lh-muted);
  line-height: 1.5;
}

.panel {
  padding: 1.2rem 1.15rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.section-head h2 {
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
  font-family: 'Manrope', sans-serif;
  font-size: 0.75rem;
  font-weight: 800;
}

.text-btn {
  border-radius: 0.55rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 700;
}

.layout {
  display: grid;
  grid-template-columns: minmax(16rem, 0.9fr) minmax(0, 1.4fr);
  gap: 1rem;
}

.notice-list,
.request-list,
.teacher-list,
.teacher-chips {
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.notice-btn,
.request-btn {
  width: 100%;
  text-align: left;
  border-radius: 0.75rem;
  padding: 0.75rem 0.8rem;
  display: grid;
  gap: 0.2rem;
}

.notice-list li.unread .notice-btn {
  border-color: rgba(126, 184, 164, 0.35);
  background: var(--lh-accent-soft);
}

.notice-btn span,
.request-btn p {
  color: var(--lh-muted);
  font-size: 0.9rem;
}

.request-btn.active {
  border-color: rgba(126, 184, 164, 0.45);
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

.confirmed-schedule h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.05rem;
  color: var(--lh-accent);
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

.assignment h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.1rem;
  color: var(--lh-accent);
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

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
