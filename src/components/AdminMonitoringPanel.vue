<template>
  <section class="panel">
    <div class="head">
      <div>
        <h2>Administrative monitoring</h2>
        <p>
          Review completed classes, teacher reports, student feedback, attendance, and scheduling
          statistics to support performance evaluation and planning.
        </p>
      </div>
      <button type="button" class="refresh" :disabled="loading" @click="emit('refresh')">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <p v-if="loading && !overview" class="empty">Loading monitoring overview...</p>
    <p v-else-if="error" class="empty error">{{ error }}</p>
    <template v-else-if="overview">
      <div class="metrics">
        <div v-for="item in summaryItems" :key="item.label" class="metric">
          <span class="metric-label">{{ item.label }}</span>
          <strong class="metric-value">{{ item.value }}</strong>
        </div>
      </div>

      <div class="columns">
        <section>
          <h3>Scheduling statistics</h3>
          <dl class="stats">
            <div>
              <dt>Pending requests</dt>
              <dd>{{ overview.scheduling.pending }}</dd>
            </div>
            <div>
              <dt>Approved</dt>
              <dd>{{ overview.scheduling.approved }}</dd>
            </div>
            <div>
              <dt>Rejected</dt>
              <dd>{{ overview.scheduling.rejected }}</dd>
            </div>
            <div>
              <dt>Approval rate</dt>
              <dd>{{ overview.scheduling.approvalRate }}%</dd>
            </div>
            <div>
              <dt>Avg. approval time</dt>
              <dd>
                {{
                  overview.scheduling.averageApprovalHours == null
                    ? '—'
                    : `${overview.scheduling.averageApprovalHours}h`
                }}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>Attendance records</h3>
          <dl class="stats">
            <div>
              <dt>Recorded</dt>
              <dd>{{ overview.attendance.recorded }}</dd>
            </div>
            <div>
              <dt>Present</dt>
              <dd>{{ overview.attendance.present }}</dd>
            </div>
            <div>
              <dt>Late</dt>
              <dd>{{ overview.attendance.late }}</dd>
            </div>
            <div>
              <dt>Absent / excused</dt>
              <dd>{{ overview.attendance.absent + overview.attendance.excused }}</dd>
            </div>
            <div>
              <dt>Present rate</dt>
              <dd>{{ overview.attendance.presentRate }}%</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>Class pipeline</h3>
          <dl class="stats">
            <div>
              <dt>Scheduled</dt>
              <dd>{{ overview.classStats.scheduled }}</dd>
            </div>
            <div>
              <dt>In progress</dt>
              <dd>{{ overview.classStats.inProgress }}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{{ overview.classStats.completed }}</dd>
            </div>
            <div>
              <dt>Completion rate</dt>
              <dd>{{ overview.classStats.completionRate }}%</dd>
            </div>
            <div>
              <dt>Progress notes</dt>
              <dd>{{ overview.summary.studentsWithProgressNotes }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section class="block">
        <h3>Teacher performance</h3>
        <p v-if="!overview.teacherPerformance.length" class="empty">No teachers to evaluate yet.</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Subject</th>
                <th>Completed</th>
                <th>Reports</th>
                <th>Feedback</th>
                <th>Avg rating</th>
                <th>Attendance logged</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="teacher in overview.teacherPerformance" :key="teacher.id">
                <td>{{ teacher.fullName }}</td>
                <td>{{ teacher.subjectExpertise || '—' }}</td>
                <td>{{ teacher.completedClasses }}</td>
                <td>{{ teacher.reportsSubmitted }}</td>
                <td>{{ teacher.feedbackCount }}</td>
                <td>{{ teacher.averageRating == null ? '—' : `${teacher.averageRating}/5` }}</td>
                <td>{{ teacher.attendanceRecorded }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="lists">
        <section>
          <h3>Recent completed classes</h3>
          <p v-if="!overview.recentCompletedClasses.length" class="empty">No completed classes yet.</p>
          <ul v-else>
            <li v-for="item in overview.recentCompletedClasses" :key="item.id">
              <strong>{{ item.title }}</strong>
              <span>
                {{ formatDate(item.classDate) }}
                ·
                {{ item.attendanceStatusLabel || item.attendanceStatus || 'Attendance pending' }}
              </span>
              <span v-if="item.teacher || item.student">
                {{ item.teacher?.fullName || 'Teacher' }}
                with
                {{ item.student?.fullName || 'Student' }}
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h3>Recent teacher reports</h3>
          <p v-if="!overview.recentLessonReports.length" class="empty">No lesson reports yet.</p>
          <ul v-else>
            <li v-for="item in overview.recentLessonReports" :key="item.id">
              <strong>{{ item.lessonTopic }}</strong>
              <span>
                {{ formatDate(item.reportDate) }} · {{ item.attendanceStatusLabel }}
                <template v-if="item.hasFeedback"> · Feedback received</template>
              </span>
              <span v-if="item.studentProgress">Progress: {{ item.studentProgress }}</span>
            </li>
          </ul>
        </section>

        <section>
          <h3>Recent student feedback</h3>
          <p v-if="!overview.recentStudentFeedback.length" class="empty">No feedback yet.</p>
          <ul v-else>
            <li v-for="item in overview.recentStudentFeedback" :key="item.id">
              <strong>{{ item.lessonTopic || 'Lesson feedback' }} · {{ item.overallRating }}/5</strong>
              <span>{{ item.comments }}</span>
              <span v-if="item.student">From {{ item.student.fullName }}</span>
            </li>
          </ul>
        </section>

        <section>
          <h3>Attendance log</h3>
          <p v-if="!overview.attendanceRecords.length" class="empty">No attendance records yet.</p>
          <ul v-else>
            <li v-for="item in overview.attendanceRecords" :key="item.id">
              <strong>{{ item.title }}</strong>
              <span>
                {{ formatDate(item.classDate) }} · {{ item.attendanceStatusLabel }}
              </span>
              <span v-if="item.student">
                {{ item.student.fullName }}
                <template v-if="item.teacher"> · {{ item.teacher.fullName }}</template>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <p v-if="overview.generatedAt" class="generated">
        Snapshot generated {{ formatDateTime(overview.generatedAt) }}
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AdminMonitoringOverview } from '../stores/adminMonitoring'

const props = defineProps<{
  overview: AdminMonitoringOverview | null
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  refresh: []
}>()

const summaryItems = computed(() => {
  const summary = props.overview?.summary
  if (!summary) return []
  return [
    { label: 'Completed classes', value: String(summary.completedClasses) },
    { label: 'Lesson reports', value: String(summary.lessonReports) },
    { label: 'Student feedback', value: String(summary.studentFeedback) },
    {
      label: 'Avg. feedback rating',
      value: summary.averageFeedbackRating == null ? '—' : `${summary.averageFeedbackRating}/5`,
    },
    { label: 'Attendance recorded', value: String(summary.attendanceRecorded) },
    { label: 'Pending schedules', value: String(summary.pendingScheduleRequests) },
  ]
})

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.panel {
  padding: 1.25rem 1.2rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

h2,
h3,
p,
.empty,
.metric-label,
.metric-value,
.stats,
table,
ul,
.refresh,
.generated {
  font-family: 'Manrope', sans-serif;
}

h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

h3 {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--lh-ink);
  margin-bottom: 0.55rem;
}

p {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.92rem;
  line-height: 1.45;
  max-width: 42rem;
}

.refresh {
  border: 1px solid var(--lh-line);
  border-radius: 0.55rem;
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  font-size: 0.84rem;
  font-weight: 700;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

.refresh:disabled {
  opacity: 0.65;
  cursor: wait;
}

.empty {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-style: italic;
}

.empty.error {
  color: #fecaca;
  font-style: normal;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin-top: 1rem;
}

.metric {
  padding: 0.75rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.7rem;
  background: rgba(20, 25, 31, 0.65);
}

.metric-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--lh-faint);
}

.metric-value {
  display: block;
  margin-top: 0.25rem;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--lh-ink);
}

.columns,
.lists {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
  margin-top: 1rem;
}

.lists {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.columns section,
.lists section,
.block {
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.45);
}

.block {
  margin-top: 1rem;
}

.stats {
  display: grid;
  gap: 0.45rem;
}

.stats > div {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.86rem;
}

.stats dt {
  color: var(--lh-muted);
}

.stats dd {
  color: var(--lh-ink);
  font-weight: 800;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

th,
td {
  text-align: left;
  padding: 0.45rem 0.4rem;
  border-bottom: 1px solid var(--lh-line);
  white-space: nowrap;
}

th {
  color: var(--lh-faint);
  font-weight: 700;
}

td {
  color: var(--lh-ink);
}

ul {
  list-style: none;
  display: grid;
  gap: 0.55rem;
}

li {
  display: grid;
  gap: 0.15rem;
  font-size: 0.86rem;
}

li strong {
  color: var(--lh-ink);
}

li span {
  color: var(--lh-muted);
}

.generated {
  margin-top: 0.9rem;
  font-size: 0.78rem;
  color: var(--lh-faint);
}

@media (max-width: 960px) {
  .metrics,
  .columns,
  .lists {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .head {
    flex-direction: column;
  }

  .metrics,
  .columns,
  .lists {
    grid-template-columns: 1fr;
  }
}
</style>
