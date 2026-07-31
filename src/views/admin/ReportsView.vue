<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useLessonReportsStore, type LessonReport } from '../../stores/lessonReports'
import { useStudentFeedbackStore, type StudentFeedback } from '../../stores/studentFeedback'
import { useAdminMonitoringStore } from '../../stores/adminMonitoring'
import { formatDateTime, parseApiDate } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'
import AdminReportsFeedbackWorkspace from '../../components/AdminReportsFeedbackWorkspace.vue'

type Range = 'month' | 'quarter' | 'all'
type Area = 'overview' | 'workspace'

const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const monitoringStore = useAdminMonitoringStore()

const { loading: loadingReports, reports } = storeToRefs(lessonReportsStore)
const { loading: loadingFeedback, feedback } = storeToRefs(studentFeedbackStore)
const { overview } = storeToRefs(monitoringStore)

const area = ref<Area>('workspace')
const range = ref<Range>('month')

const RANGE_LABEL: Record<Range, string> = {
  month: 'This month',
  quarter: 'Last 3 months',
  all: 'All time',
}

function withinRange(value: string | null | undefined) {
  if (range.value === 'all') return true
  const date = parseApiDate(value)
  if (!date) return false
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - (range.value === 'month' ? 1 : 3))
  return date >= cutoff
}

const visibleReports = computed(() =>
  reports.value
    .filter((report) => withinRange(report.submittedAt))
    .slice()
    .sort((a, b) => ((a.submittedAt ?? '') < (b.submittedAt ?? '') ? 1 : -1)),
)

const visibleFeedback = computed(() =>
  feedback.value
    .filter((entry) => withinRange(entry.submittedAt))
    .slice()
    .sort((a, b) => ((a.submittedAt ?? '') < (b.submittedAt ?? '') ? 1 : -1)),
)

/** Completed classes with no report filed yet — the teacher-side backlog. */
const overdueCount = computed(() => {
  const summary = overview.value?.summary
  if (!summary) return 0
  return Math.max(0, summary.completedClasses - summary.lessonReports)
})

const averageRating = computed(() => {
  const rated = visibleFeedback.value.filter((entry) => entry.overallRating != null)
  if (!rated.length) return null
  const total = rated.reduce((sum, entry) => sum + (entry.overallRating ?? 0), 0)
  return (total / rated.length).toFixed(1)
})

usePageEyebrow(() =>
  area.value === 'workspace'
    ? 'Each lesson report and student feedback stay aligned'
    : 'Teacher reports left · student feedback right',
)

function reportStatus(report: LessonReport): { label: string; tone: string } {
  if (report.hasFeedback) return { label: 'Published', tone: 'accent' }
  if (report.needsFeedback) return { label: 'Awaiting feedback', tone: 'warm' }
  return { label: 'Filed', tone: 'muted' }
}

function attendanceTone(status: string) {
  const value = (status || '').toLowerCase()
  if (value.includes('present')) return 'accent'
  if (value.includes('late')) return 'warm'
  if (value.includes('absent')) return 'danger'
  return 'ink'
}

function reportTitle(report: LessonReport) {
  const student = report.student?.fullName ?? 'Student'
  const subject = report.classSubject || report.classTitle || report.lessonTopic
  return subject ? `${student} · ${subject}` : student
}

function reportWhen(report: LessonReport) {
  const teacher = report.teacher?.fullName ?? 'Teacher'
  const when = report.submittedAt ? formatDateTime(report.submittedAt) : report.reportDate
  return `${teacher} · ${when}`
}

function feedbackWhen(entry: StudentFeedback) {
  const teacher = entry.teacher?.fullName ?? 'Teacher'
  const subject = entry.classSubject || entry.classTitle || entry.lessonTopic || ''
  const when = entry.submittedAt ? formatDateTime(entry.submittedAt) : ''
  return ['on ' + teacher, subject, when].filter(Boolean).join(' · ')
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function exportCsv() {
  const header = ['Student', 'Teacher', 'Subject', 'Submitted', 'Attendance', 'Progress', 'Remarks']
  const lines = visibleReports.value.map((report) =>
    [
      report.student?.fullName,
      report.teacher?.fullName,
      report.classSubject || report.classTitle,
      report.submittedAt,
      report.attendanceStatusLabel || report.attendanceStatus,
      report.studentProgress,
      report.remarks,
    ]
      .map(csvCell)
      .join(','),
  )

  const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `lesson-reports-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="reports">
    <nav class="area-tabs" aria-label="Reports sections">
      <button
        type="button"
        class="area-tab"
        :class="{ active: area === 'workspace' }"
        @click="area = 'workspace'"
      >
        Aligned workspace
      </button>
      <button
        type="button"
        class="area-tab"
        :class="{ active: area === 'overview' }"
        @click="area = 'overview'"
      >
        Overview &amp; export
      </button>
    </nav>

    <AdminReportsFeedbackWorkspace v-if="area === 'workspace'" />

    <template v-else>
    <div class="toolbar">
      <div class="range" role="group" aria-label="Date range">
        <button
          v-for="key in ['month', 'quarter', 'all'] as Range[]"
          :key="key"
          type="button"
          class="range-btn"
          :class="{ active: range === key }"
          @click="range = key"
        >
          {{ RANGE_LABEL[key] }}
        </button>
      </div>
      <button
        type="button"
        class="btn-primary"
        :disabled="!visibleReports.length"
        @click="exportCsv"
      >
        Export CSV
      </button>
    </div>

    <div class="split">
      <!-- Lesson reports -->
      <div class="col">
        <div class="col-head">
          <h2>Lesson reports</h2>
          <span v-if="overdueCount" class="pill danger">{{ overdueCount }} overdue</span>
          <p class="col-meta">{{ visibleReports.length }} filed</p>
        </div>

        <p v-if="loadingReports" class="empty">Loading reports…</p>
        <p v-else-if="!visibleReports.length" class="empty">No reports in this range.</p>

        <div v-else class="cards">
          <article v-for="report in visibleReports" :key="report.id" class="card">
            <div class="card-head">
              <p class="card-title">{{ reportTitle(report) }}</p>
              <span class="chip" :class="reportStatus(report).tone">
                {{ reportStatus(report).label }}
              </span>
            </div>
            <p class="card-sub">{{ reportWhen(report) }}</p>
            <p v-if="report.remarks || report.lessonTopic" class="card-body">
              {{ report.remarks || report.lessonTopic }}
            </p>
            <div class="card-foot">
              <p class="foot-item">
                Attendance
                <span :class="attendanceTone(report.attendanceStatus)">
                  {{ report.attendanceStatusLabel || report.attendanceStatus || '—' }}
                </span>
              </p>
              <p v-if="report.studentProgress" class="foot-item">
                Progress <span class="ink">{{ report.studentProgress }}</span>
              </p>
            </div>
          </article>
        </div>
      </div>

      <!-- Student feedback -->
      <div class="col">
        <div class="col-head">
          <h2>Student feedback</h2>
          <span v-if="averageRating" class="pill accent">Average {{ averageRating }}</span>
          <p class="col-meta">{{ visibleFeedback.length }} responses</p>
        </div>

        <p v-if="loadingFeedback" class="empty">Loading feedback…</p>
        <p v-else-if="!visibleFeedback.length" class="empty">No feedback in this range.</p>

        <div v-else class="cards">
          <article v-for="entry in visibleFeedback" :key="entry.id" class="card">
            <div class="card-head">
              <p class="card-title">{{ entry.student?.fullName || 'Student' }}</p>
              <p v-if="entry.overallRating != null" class="rating">
                {{ entry.overallRating.toFixed(1) }}
              </p>
            </div>
            <p class="card-sub">{{ feedbackWhen(entry) }}</p>
            <p v-if="entry.comments" class="card-body">{{ entry.comments }}</p>
            <p v-if="entry.suggestions" class="card-body suggestion">
              Suggestion — {{ entry.suggestions }}
            </p>
          </article>
        </div>
      </div>
    </div>
    </template>
  </section>
</template>

<style scoped>
.reports {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.area-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.area-tab {
  height: 31px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--lh-radius-control);
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
  background: transparent;
  color: var(--lh-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.area-tab.active {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.area-tab:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 9px;
}

.range {
  display: flex;
  gap: 5px;
}

.range-btn {
  height: 31px;
  padding: 0 13px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition:
    color var(--lh-ease),
    background var(--lh-ease);
}

.range-btn:hover {
  color: var(--lh-ink);
}

.range-btn.active {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
}

.range-btn:focus-visible,
.btn-primary:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.btn-primary {
  margin-left: auto;
  height: 31px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.col-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.col-head h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 19px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.col-meta {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--lh-dim);
}

.pill {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 800;
}

.pill.danger {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.pill.accent {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.card {
  padding: 14px 16px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.card-title {
  font-size: 14px;
  font-weight: 700;
  min-width: 0;
}

.chip {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 2px 7px;
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

.chip.muted {
  background: var(--lh-chip);
  color: var(--lh-faint);
}

.rating {
  margin-left: auto;
  font-size: 13px;
  font-weight: 700;
  color: var(--lh-accent);
}

.card-sub {
  margin-top: 5px;
  font-size: 12px;
  color: var(--lh-faint);
}

.card-body {
  margin-top: 9px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--lh-muted);
  text-wrap: pretty;
}

.card-body.suggestion {
  margin-top: 7px;
  color: var(--lh-faint);
}

.card-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 11px;
}

.foot-item {
  font-size: 11.5px;
  color: var(--lh-muted);
}

.foot-item span {
  font-weight: 700;
}

.foot-item .accent {
  color: var(--lh-accent);
}

.foot-item .warm {
  color: var(--lh-warm);
}

.foot-item .danger {
  color: var(--lh-danger);
}

.foot-item .ink {
  color: var(--lh-ink);
}

.empty {
  padding: 14px 16px;
  border-radius: var(--lh-radius-panel);
  box-shadow: inset 0 0 0 1px var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

@media (max-width: 1000px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
