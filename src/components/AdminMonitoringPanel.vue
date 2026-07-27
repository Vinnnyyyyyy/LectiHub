<template>
  <section class="monitor">
    <aside class="sidebar" aria-label="Monitoring sections">
      <div class="brand-block">
        <p class="kicker">Control room</p>
        <h2>Monitoring</h2>
        <p class="side-copy">Live pulse across scheduling, teachers, and class outcomes.</p>
      </div>

      <nav class="side-nav" role="tablist" aria-orientation="vertical">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          role="tab"
          class="side-link"
          :class="{ active: activeSection === item.id }"
          :aria-selected="activeSection === item.id"
          @click="activeSection = item.id"
        >
          <span class="side-label">{{ item.label }}</span>
          <span v-if="item.badge != null" class="side-badge">{{ item.badge }}</span>
        </button>
      </nav>

      <button type="button" class="refresh" :disabled="loading" @click="emit('refresh')">
        {{ loading ? 'Refreshing…' : 'Refresh data' }}
      </button>
    </aside>

    <div class="main">
      <p v-if="loading && !overview" class="empty">Loading monitoring overview…</p>
      <p v-else-if="error" class="empty error">{{ error }}</p>

      <template v-else-if="overview">
        <header class="main-head">
          <div>
            <p class="kicker">{{ activeMeta.kicker }}</p>
            <h3>{{ activeMeta.title }}</h3>
            <p class="main-copy">{{ activeMeta.copy }}</p>
          </div>
          <p v-if="overview.generatedAt" class="generated">
            Updated {{ formatDateTime(overview.generatedAt) }}
          </p>
        </header>

        <div v-show="activeSection === 'overview'" class="view">
          <div class="metrics">
            <div v-for="item in summaryItems" :key="item.label" class="metric">
              <span class="metric-label">{{ item.label }}</span>
              <strong class="metric-value">{{ item.value }}</strong>
            </div>
          </div>

          <div class="insight-row">
            <article class="insight">
              <p class="insight-label">Scheduling health</p>
              <strong>{{ overview.scheduling.approvalRate }}% approval</strong>
              <p>
                {{ overview.scheduling.pending }} pending ·
                {{ overview.scheduling.approved }} approved
              </p>
            </article>
            <article class="insight">
              <p class="insight-label">Attendance</p>
              <strong>{{ overview.attendance.presentRate }}% present</strong>
              <p>{{ overview.attendance.recorded }} recorded sessions</p>
            </article>
            <article class="insight">
              <p class="insight-label">Pipeline</p>
              <strong>{{ overview.classStats.completionRate }}% complete</strong>
              <p>
                {{ overview.classStats.scheduled }} scheduled ·
                {{ overview.classStats.completed }} done
              </p>
            </article>
          </div>
        </div>

        <div v-show="activeSection === 'operations'" class="view">
          <div class="stat-grid">
            <section class="stat-card">
              <h4>Scheduling</h4>
              <dl class="stats">
                <div>
                  <dt>Pending</dt>
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

            <section class="stat-card">
              <h4>Attendance</h4>
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

            <section class="stat-card">
              <h4>Class pipeline</h4>
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
        </div>

        <div v-show="activeSection === 'teachers'" class="view">
          <section class="table-card">
            <div class="table-head">
              <h4>Teacher performance</h4>
              <p>{{ overview.teacherPerformance.length }} teachers</p>
            </div>
            <p v-if="!overview.teacherPerformance.length" class="empty soft">
              No teachers to evaluate yet.
            </p>
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
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="teacher in overview.teacherPerformance" :key="teacher.id">
                    <td>
                      <div class="teacher-cell">
                        <span class="avatar" aria-hidden="true">{{
                          initials(teacher.fullName)
                        }}</span>
                        <span>{{ teacher.fullName }}</span>
                      </div>
                    </td>
                    <td>{{ teacher.subjectExpertise || '—' }}</td>
                    <td>{{ teacher.completedClasses }}</td>
                    <td>{{ teacher.reportsSubmitted }}</td>
                    <td>{{ teacher.feedbackCount }}</td>
                    <td>
                      {{ teacher.averageRating == null ? '—' : `${teacher.averageRating}/5` }}
                    </td>
                    <td>{{ teacher.attendanceRecorded }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div v-show="activeSection === 'activity'" class="view">
          <div class="activity-grid">
            <section class="feed-card">
              <h4>Completed classes</h4>
              <p v-if="!overview.recentCompletedClasses.length" class="empty soft">
                No completed classes yet.
              </p>
              <ul v-else>
                <li v-for="item in overview.recentCompletedClasses" :key="item.id">
                  <strong>{{ item.title }}</strong>
                  <span>
                    {{ formatDate(item.classDate) }} ·
                    {{
                      item.attendanceStatusLabel || item.attendanceStatus || 'Attendance pending'
                    }}
                  </span>
                  <span v-if="item.teacher || item.student">
                    {{ item.teacher?.fullName || 'Teacher' }} with
                    {{ item.student?.fullName || 'Student' }}
                  </span>
                </li>
              </ul>
            </section>

            <section class="feed-card">
              <h4>Attendance log</h4>
              <p v-if="!overview.attendanceRecords.length" class="empty soft">
                No attendance records yet.
              </p>
              <ul v-else>
                <li v-for="item in overview.attendanceRecords" :key="item.id">
                  <strong>{{ item.title }}</strong>
                  <span>{{ formatDate(item.classDate) }} · {{ item.attendanceStatusLabel }}</span>
                  <span v-if="item.student">
                    {{ item.student.fullName }}
                    <template v-if="item.teacher"> · {{ item.teacher.fullName }}</template>
                  </span>
                </li>
              </ul>
            </section>

            <section class="feed-card">
              <h4>Teacher reports</h4>
              <p v-if="!overview.recentLessonReports.length" class="empty soft">
                No lesson reports yet.
              </p>
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

            <section class="feed-card">
              <h4>Student feedback</h4>
              <p v-if="!overview.recentStudentFeedback.length" class="empty soft">
                No feedback yet.
              </p>
              <ul v-else>
                <li v-for="item in overview.recentStudentFeedback" :key="item.id">
                  <strong
                    >{{ item.lessonTopic || 'Lesson feedback' }} ·
                    {{ item.overallRating }}/5</strong
                  >
                  <span>{{ item.comments }}</span>
                  <span v-if="item.student">From {{ item.student.fullName }}</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminMonitoringOverview } from '../stores/adminMonitoring'

type MonitorSection = 'overview' | 'operations' | 'teachers' | 'activity'

const props = defineProps<{
  overview: AdminMonitoringOverview | null
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  refresh: []
}>()

const activeSection = ref<MonitorSection>('overview')

const navItems = computed(() => {
  const summary = props.overview?.summary
  return [
    {
      id: 'overview' as const,
      label: 'Overview',
      badge: summary ? summary.completedClasses : null,
    },
    {
      id: 'operations' as const,
      label: 'Operations',
      badge: summary ? summary.pendingScheduleRequests : null,
    },
    {
      id: 'teachers' as const,
      label: 'Teachers',
      badge: props.overview?.teacherPerformance.length ?? null,
    },
    {
      id: 'activity' as const,
      label: 'Activity',
      badge: summary ? summary.lessonReports + summary.studentFeedback : null,
    },
  ]
})

const activeMeta = computed(() => {
  const map = {
    overview: {
      kicker: 'Snapshot',
      title: 'Center overview',
      copy: 'Key totals and health signals across the learning center.',
    },
    operations: {
      kicker: 'Throughput',
      title: 'Operations',
      copy: 'Scheduling, attendance, and class pipeline in one view.',
    },
    teachers: {
      kicker: 'Faculty',
      title: 'Teacher performance',
      copy: 'Completed classes, reports, feedback, and attendance logging by teacher.',
    },
    activity: {
      kicker: 'Recent',
      title: 'Activity feed',
      copy: 'Latest completed classes, attendance, reports, and student feedback.',
    },
  }
  return map[activeSection.value]
})

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

function initials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

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
.monitor {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  gap: 0;
  min-height: 34rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  overflow: hidden;
  background: var(--lh-panel);
  animation: rise 0.45s ease both;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.15rem 0.9rem 1.1rem;
  border-right: 1px solid var(--lh-line);
  background: var(--lh-bg-elevated);
}

.brand-block h2,
.main-head h3,
.stat-card h4,
.table-head h4,
.feed-card h4 {
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
.empty,
.metric-label,
.metric-value,
.stats,
table,
ul,
.refresh,
.generated,
.insight,
.side-link,
.side-badge,
.table-head p {
  font-family: 'Manrope', sans-serif;
}

.side-copy,
.main-copy {
  margin-top: 0.4rem;
  color: var(--lh-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.side-nav {
  display: grid;
  gap: 0.3rem;
  flex: 1;
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
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.side-link:hover {
  background: color-mix(in srgb, var(--lh-ink) 5%, transparent);
  color: var(--lh-ink);
}

.side-link.active {
  background: var(--lh-accent-soft);
  border-color: color-mix(in srgb, var(--lh-accent) 35%, transparent);
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
  background: color-mix(in srgb, var(--lh-ink) 8%, transparent);
  color: var(--lh-faint);
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.side-link.active .side-badge {
  background: color-mix(in srgb, var(--lh-accent) 18%, transparent);
  color: var(--lh-accent);
}

.refresh {
  border: 1px solid var(--lh-line);
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--lh-bg-elevated) 45%, transparent);
  color: var(--lh-ink);
  font-size: 0.82rem;
  font-weight: 750;
  padding: 0.6rem 0.75rem;
  cursor: pointer;
}

.refresh:disabled {
  opacity: 0.6;
  cursor: wait;
}

.main {
  min-width: 0;
  padding: 1.15rem 1.2rem 1.25rem;
  background: color-mix(in srgb, var(--lh-bg-elevated) 35%, transparent);
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

.generated {
  color: var(--lh-faint);
  font-size: 0.78rem;
  font-weight: 650;
  white-space: nowrap;
}

.view {
  animation: rise 0.35s ease both;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.metric {
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--lh-bg-elevated) 50%, transparent);
}

.metric-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 750;
  color: var(--lh-faint);
  letter-spacing: 0.02em;
}

.metric-value {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--lh-ink);
  font-variant-numeric: tabular-nums;
}

.insight-row,
.stat-grid,
.activity-grid {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.85rem;
}

.insight-row,
.stat-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.activity-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.insight,
.stat-card,
.table-card,
.feed-card {
  padding: 0.95rem 1rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--lh-bg-elevated) 45%, transparent);
}

.insight-label {
  margin: 0;
  font-family: 'Manrope', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.insight strong {
  display: block;
  margin-top: 0.35rem;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

.insight p {
  margin: 0.3rem 0 0;
  font-family: 'Manrope', sans-serif;
  color: var(--lh-muted);
  font-size: 0.84rem;
}

.stat-card h4,
.table-head h4,
.feed-card h4 {
  font-size: 1.05rem;
  margin-bottom: 0.7rem;
  color: var(--lh-accent);
}

.stats {
  display: grid;
  gap: 0.5rem;
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
  font-variant-numeric: tabular-nums;
}

.table-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.table-head p {
  margin: 0;
  color: var(--lh-faint);
  font-size: 0.8rem;
  font-weight: 700;
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
  padding: 0.65rem 0.45rem;
  border-bottom: 1px solid var(--lh-line);
  white-space: nowrap;
}

th {
  color: var(--lh-faint);
  font-weight: 750;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

td {
  color: var(--lh-ink);
}

.teacher-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.avatar {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 0.55rem;
  display: grid;
  place-items: center;
  font-size: 0.68rem;
  font-weight: 800;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  border: 1px solid color-mix(in srgb, var(--lh-accent) 28%, transparent);
}

ul {
  list-style: none;
  display: grid;
  gap: 0.7rem;
  margin: 0;
  padding: 0;
}

li {
  display: grid;
  gap: 0.18rem;
  font-size: 0.86rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--lh-line);
}

li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

li strong {
  color: var(--lh-ink);
}

li span {
  color: var(--lh-muted);
}

.empty {
  margin: 0.5rem 0 0;
  color: var(--lh-faint);
  font-style: italic;
  font-size: 0.9rem;
}

.empty.soft {
  border: none;
  padding: 0.35rem 0 0;
}

.empty.error {
  color: var(--lh-danger);
  font-style: normal;
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

@media (max-width: 980px) {
  .metrics,
  .insight-row,
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 860px) {
  .monitor {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: none;
    border-bottom: 1px solid var(--lh-line);
  }

  .side-nav {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    flex: initial;
  }

  .side-link {
    flex-direction: column;
    align-items: flex-start;
    min-height: 3.4rem;
  }

  .activity-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .metrics,
  .insight-row,
  .stat-grid,
  .side-nav {
    grid-template-columns: 1fr;
  }

  .main-head {
    flex-direction: column;
  }
}
</style>
