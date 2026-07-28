<script setup lang="ts">
/**
 * Records — everything the teacher has filed, taught or been told.
 * Stat strip over a tabbed table: reports, past classes, archived, feedback.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore } from '../../stores/classes'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useStudentFeedbackStore } from '../../stores/studentFeedback'
import { formatDate, formatDateTime } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

type Tab = 'reports' | 'classes' | 'archived' | 'feedback'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()

const { schedules, loading: loadingClasses, loadingHistory } = storeToRefs(classesStore)
const { reports, loading: loadingReports } = storeToRefs(lessonReportsStore)
const { feedback, loading: loadingFeedback } = storeToRefs(studentFeedbackStore)

const tab = ref<Tab>('reports')

const TABS: { id: Tab; label: string }[] = [
  { id: 'reports', label: 'Reports filed' },
  { id: 'classes', label: 'Past classes' },
  { id: 'archived', label: 'Archived' },
  { id: 'feedback', label: 'Feedback received' },
]

const past = computed(() => classesStore.past)
const archived = computed(() => classesStore.archived)
const reportedClassIds = computed(() => new Set(reports.value.map((report) => report.classId)))

/* ── Stat strip ──────────────────────────────────────────── */

const taughtMinutes = computed(() =>
  schedules.value
    .filter((item) => item.status === 'completed')
    .reduce((sum, item) => sum + (item.durationMinutes || 30), 0),
)

const reportsDue = computed(
  () => past.value.filter((item) => !reportedClassIds.value.has(item.id)).length,
)

const attendanceRate = computed(() => {
  const recorded = schedules.value.filter(
    (item) => item.attendanceStatus && item.attendanceStatus !== 'not_recorded',
  )
  if (!recorded.length) return null
  const present = recorded.filter((item) => (item.attendanceStatus || '').includes('present'))
  return Math.round((present.length / recorded.length) * 100)
})

const feedbackAverage = computed(() => {
  const rated = feedback.value.filter((entry) => entry.overallRating != null)
  if (!rated.length) return null
  return (rated.reduce((sum, entry) => sum + (entry.overallRating ?? 0), 0) / rated.length).toFixed(
    1,
  )
})

const stats = computed(() => [
  {
    label: 'Teaching hours',
    value: taughtMinutes.value ? (taughtMinutes.value / 60).toFixed(0) : '0',
    tone: 'ink',
  },
  {
    label: 'Reports filed',
    value: reportsDue.value
      ? `${reports.value.length} · ${reportsDue.value} due`
      : String(reports.value.length),
    tone: reportsDue.value ? 'danger' : 'ink',
  },
  {
    label: 'Attendance rate',
    value: attendanceRate.value == null ? '—' : `${attendanceRate.value}%`,
    tone: 'ink',
  },
  { label: 'Feedback average', value: feedbackAverage.value ?? '—', tone: 'accent' },
])

usePageEyebrow(() => {
  const taught = schedules.value.filter((item) => item.status === 'completed').length
  return `${taught} class${taught === 1 ? '' : 'es'} taught · term to date`
})

/* ── Table ───────────────────────────────────────────────── */

const loading = computed(
  () =>
    loadingClasses.value || loadingReports.value || loadingHistory.value || loadingFeedback.value,
)

function attendanceTone(status?: string) {
  const value = (status || '').toLowerCase()
  if (value.includes('present')) return 'accent'
  if (value.includes('late')) return 'warm'
  if (value.includes('absent')) return 'danger'
  return 'dim'
}

// The shell bootstraps classes and reports; feedback is only needed here.
onMounted(() => {
  if (!feedback.value.length) void studentFeedbackStore.fetchMine()
})
</script>

<template>
  <section class="records">
    <div class="stat-strip">
      <div v-for="stat in stats" :key="stat.label" class="stat">
        <p class="stat-label">{{ stat.label }}</p>
        <p class="stat-value" :class="stat.tone">{{ loading ? '—' : stat.value }}</p>
      </div>
    </div>

    <nav class="tabs" aria-label="Records">
      <button
        v-for="item in TABS"
        :key="item.id"
        type="button"
        class="tab"
        :class="{ active: tab === item.id }"
        :aria-current="tab === item.id ? 'true' : undefined"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </nav>

    <div class="table">
      <!-- Reports -->
      <template v-if="tab === 'reports'">
        <div class="row head">
          <span>Student</span><span>Session</span><span>Attendance</span><span>Pages</span>
          <span>Status</span>
        </div>
        <p v-if="loading" class="state">Loading…</p>
        <p v-else-if="!reports.length" class="state">No reports filed yet.</p>
        <div v-for="report in reports" v-else :key="report.id" class="row">
          <span class="strong">{{ report.student?.fullName ?? 'Student' }}</span>
          <span class="muted">{{ formatDate(report.reportDate) }} · {{ report.reportTime }}</span>
          <span :class="attendanceTone(report.attendanceStatus)">
            {{ report.attendanceStatusLabel || report.attendanceStatus || '—' }}
          </span>
          <span class="muted">{{ report.pagesDiscussed || '—' }}</span>
          <span>
            <span class="chip" :class="report.hasFeedback ? 'accent' : 'warm'">
              {{ report.hasFeedback ? 'Published' : 'Awaiting feedback' }}
            </span>
          </span>
        </div>
      </template>

      <!-- Past classes -->
      <template v-else-if="tab === 'classes'">
        <div class="row head">
          <span>Student</span><span>Session</span><span>Attendance</span><span>Duration</span>
          <span>Report</span>
        </div>
        <p v-if="loading" class="state">Loading…</p>
        <p v-else-if="!past.length" class="state">No past classes yet.</p>
        <div v-for="item in past" v-else :key="item.id" class="row">
          <span class="strong">{{ item.student?.fullName ?? 'Student' }}</span>
          <span class="muted">
            {{ formatDate(item.classDate) }} · {{ item.timeSlot.split('-')[0] }}
          </span>
          <span :class="attendanceTone(item.attendanceStatus)">
            {{ item.attendanceStatusLabel || item.attendanceStatus || 'Not recorded' }}
          </span>
          <span class="muted">{{ item.durationMinutes || 30 }} min</span>
          <span>
            <span class="chip" :class="reportedClassIds.has(item.id) ? 'accent' : 'danger'">
              {{ reportedClassIds.has(item.id) ? 'Filed' : 'Due' }}
            </span>
          </span>
        </div>
      </template>

      <!-- Archived -->
      <template v-else-if="tab === 'archived'">
        <div class="row head">
          <span>Student</span><span>Session</span><span>Attendance</span><span>Subject</span>
          <span>Status</span>
        </div>
        <p v-if="loading" class="state">Loading…</p>
        <p v-else-if="!archived.length" class="state">Nothing archived yet.</p>
        <div v-for="item in archived" v-else :key="item.id" class="row">
          <span class="strong">{{ item.student?.fullName ?? 'Student' }}</span>
          <span class="muted">
            {{ formatDate(item.classDate) }} · {{ item.timeSlot.split('-')[0] }}
          </span>
          <span :class="attendanceTone(item.attendanceStatus)">
            {{ item.attendanceStatusLabel || item.attendanceStatus || '—' }}
          </span>
          <span class="muted">{{ item.subject || item.title || '—' }}</span>
          <span><span class="chip muted-chip">Archived</span></span>
        </div>
      </template>

      <!-- Feedback -->
      <template v-else>
        <div class="row head feedback">
          <span>Student</span><span>Rating</span><span>Session</span><span>Comment</span>
        </div>
        <p v-if="loading" class="state">Loading…</p>
        <p v-else-if="!feedback.length" class="state">No feedback received yet.</p>
        <div v-for="entry in feedback" v-else :key="entry.id" class="row feedback">
          <span class="strong">{{ entry.student?.fullName ?? 'Student' }}</span>
          <span class="rating">{{ entry.overallRating?.toFixed(1) ?? '—' }}</span>
          <span class="muted">
            {{ entry.submittedAt ? formatDateTime(entry.submittedAt) : '—' }}
          </span>
          <span class="muted comment">{{ entry.comments || '—' }}</span>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.records {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.stat-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--lh-line);
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
}

.stat {
  padding: 15px 18px;
  background: var(--lh-bg);
}

.stat-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.stat-value {
  margin-top: 10px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 30px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
}

.stat-value.accent {
  color: var(--lh-accent);
}

.stat-value.danger {
  color: var(--lh-danger);
}

.tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--lh-line);
}

.tab {
  padding: 0 0 11px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.tab:hover {
  color: var(--lh-ink);
}

.tab.active {
  border-bottom-color: var(--lh-accent);
  color: var(--lh-accent);
  font-weight: 700;
}

.tab:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.table {
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.row {
  display: grid;
  grid-template-columns: 1.4fr 1.3fr 1fr 0.9fr 1fr;
  gap: 16px;
  align-items: center;
  padding: 13px 18px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  transition: background var(--lh-ease);
}

.row.feedback {
  grid-template-columns: 1.2fr 0.5fr 1.2fr 2.4fr;
}

.row:not(.head):hover {
  background: var(--lh-bg-elevated);
}

.row.head {
  padding: 10px 18px;
  border-top: 0;
  background: var(--lh-rail);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.strong {
  font-size: 13.5px;
  font-weight: 700;
}

.muted {
  color: var(--lh-muted);
}

.comment {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accent {
  color: var(--lh-accent);
  font-weight: 600;
}

.warm {
  color: var(--lh-warm);
  font-weight: 600;
}

.danger {
  color: var(--lh-danger);
  font-weight: 600;
}

.dim {
  color: var(--lh-dim);
}

.rating {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--lh-accent);
}

.chip {
  display: inline-block;
  width: fit-content;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
}

.chip.accent {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.chip.warm {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.chip.danger {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.chip.muted-chip {
  background: var(--lh-chip);
  color: var(--lh-faint);
}

.state {
  padding: 18px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

@media (max-width: 1000px) {
  .stat-strip {
    grid-template-columns: repeat(2, 1fr);
  }

  .row,
  .row.feedback {
    grid-template-columns: 1.3fr 1.2fr 1fr;
  }

  .row > :nth-child(4),
  .row > :nth-child(5) {
    display: none;
  }
}
</style>
