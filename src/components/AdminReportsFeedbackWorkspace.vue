<template>
  <section class="records" aria-label="Reports and feedback">
    <header class="column-heads">
      <div class="column-head">
        <p class="kicker">Teacher records</p>
        <h3>Lesson reports</h3>
        <p class="copy">What teachers submitted after each class.</p>
      </div>
      <div class="column-head">
        <p class="kicker">Student voice</p>
        <h3>Student feedback</h3>
        <p class="copy">How students rated the lesson and learning experience.</p>
      </div>
      <p class="pair-count">{{ pairs.length }} paired</p>
    </header>

    <p v-if="loading" class="status">Loading reports and feedback…</p>
    <div v-else-if="!pairs.length" class="empty-state">
      <p class="empty-title">No paired records yet</p>
      <p class="status">
        Lesson reports and matching student feedback will appear here side by side.
      </p>
    </div>

    <ul v-else class="pair-list">
      <li v-for="pair in pairs" :key="pair.key" class="pair-row">
        <article class="card report-card" :class="{ placeholder: !pair.report }">
          <template v-if="pair.report">
            <div class="top">
              <strong>{{ pair.report.lessonTopic }}</strong>
              <div class="chips">
                <span class="chip">{{ pair.report.attendanceStatusLabel }}</span>
                <span v-if="pair.feedback" class="chip done">Feedback in</span>
                <span v-else class="chip pending">Awaiting feedback</span>
              </div>
            </div>
            <p class="meta">
              {{ formatDate(pair.report.reportDate) }} · {{ pair.report.reportTime }}
              <span v-if="pair.report.classSubject"> · {{ pair.report.classSubject }}</span>
            </p>
            <div class="people">
              <span v-if="pair.report.teacher">{{ pair.report.teacher.fullName }}</span>
              <span v-if="pair.report.teacher && pair.report.student" class="sep">→</span>
              <span v-if="pair.report.student">{{ pair.report.student.fullName }}</span>
            </div>
            <p v-if="pair.report.pagesDiscussed" class="meta">
              Pages: {{ pair.report.pagesDiscussed }}
            </p>
            <p v-if="pair.report.homeworkAssigned" class="meta">
              Homework: {{ pair.report.homeworkAssigned }}
            </p>
            <p v-if="pair.report.remarks" class="meta">Remarks: {{ pair.report.remarks }}</p>
            <p class="progress">{{ pair.report.studentProgress }}</p>
            <p v-if="pair.report.submittedAt" class="meta faint">
              Submitted {{ formatDateTime(pair.report.submittedAt) }}
            </p>
          </template>
          <template v-else>
            <p class="placeholder-title">No lesson report</p>
            <p class="status">Feedback exists without a matching teacher report.</p>
          </template>
        </article>

        <article class="card feedback-card" :class="{ placeholder: !pair.feedback }">
          <template v-if="pair.feedback">
            <div class="top">
              <strong>{{ pair.feedback.lessonTopic || 'Lesson feedback' }}</strong>
              <span
                v-if="pair.feedback.overallRating != null"
                class="chip score"
                :data-score="pair.feedback.overallRating"
              >
                {{ pair.feedback.overallRating }}/5
              </span>
            </div>
            <p class="meta">
              <span v-if="pair.feedback.reportDate">{{ formatDate(pair.feedback.reportDate) }}</span>
              <span v-if="pair.feedback.classSubject"> · {{ pair.feedback.classSubject }}</span>
            </p>
            <div class="people">
              <span v-if="pair.feedback.student">{{ pair.feedback.student.fullName }}</span>
              <span v-if="pair.feedback.teacher && pair.feedback.student" class="sep">→</span>
              <span v-if="pair.feedback.teacher">{{ pair.feedback.teacher.fullName }}</span>
            </div>
            <p class="section-label">Comments</p>
            <p class="body">{{ pair.feedback.comments }}</p>
            <template v-if="pair.feedback.suggestions">
              <p class="section-label">Suggestions</p>
              <p class="body">{{ pair.feedback.suggestions }}</p>
            </template>
            <p class="section-label">Learning experience</p>
            <p class="body">{{ pair.feedback.learningExperience }}</p>
            <p v-if="pair.feedback.submittedAt" class="meta faint">
              Submitted {{ formatDateTime(pair.feedback.submittedAt) }}
            </p>
          </template>
          <template v-else>
            <p class="placeholder-title">Awaiting student feedback</p>
            <p class="status">This lesson report does not have student feedback yet.</p>
          </template>
        </article>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LessonReport } from '../stores/lessonReports'
import type { StudentFeedback } from '../stores/studentFeedback'

const props = defineProps<{
  reports: LessonReport[]
  feedback: StudentFeedback[]
  loading?: boolean
}>()

interface ReportFeedbackPair {
  key: string
  classId: number
  report: LessonReport | null
  feedback: StudentFeedback | null
  sortAt: number
}

const pairs = computed(() => {
  const byClass = new Map<number, ReportFeedbackPair>()

  for (const report of props.reports) {
    byClass.set(report.classId, {
      key: `class-${report.classId}`,
      classId: report.classId,
      report,
      feedback: null,
      sortAt: Date.parse(report.submittedAt || `${report.reportDate}T${report.reportTime}`) || 0,
    })
  }

  for (const item of props.feedback) {
    const existing = byClass.get(item.classId)
    if (existing) {
      existing.feedback = item
      const feedbackAt = Date.parse(item.submittedAt || '') || 0
      existing.sortAt = Math.max(existing.sortAt, feedbackAt)
    } else {
      byClass.set(item.classId, {
        key: `class-${item.classId}`,
        classId: item.classId,
        report: null,
        feedback: item,
        sortAt: Date.parse(item.submittedAt || item.reportDate || '') || 0,
      })
    }
  }

  return [...byClass.values()].sort((a, b) => b.sortAt - a.sortAt)
})

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
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalized)
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
.records {
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  overflow: hidden;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
  animation: rise 0.45s ease both;
}

.column-heads {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 1rem;
  align-items: start;
  padding: 1.15rem 1.2rem 1rem;
  border-bottom: 1px solid var(--lh-line);
  background:
    linear-gradient(180deg, rgba(36, 44, 54, 0.55), transparent),
    rgba(14, 18, 22, 0.35);
}

.column-head h3 {
  margin: 0.15rem 0 0;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.28rem;
  font-weight: 550;
  color: var(--lh-ink);
}

.kicker,
.copy,
.pair-count,
.status,
.empty-title,
.meta,
.people,
.progress,
.body,
.section-label,
.placeholder-title,
.chip,
strong {
  font-family: 'Manrope', sans-serif;
}

.kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.copy {
  margin: 0.35rem 0 0;
  color: var(--lh-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.pair-count {
  margin: 0.35rem 0 0;
  justify-self: end;
  color: var(--lh-faint);
  font-size: 0.8rem;
  font-weight: 750;
  white-space: nowrap;
}

.status {
  margin: 0;
  color: var(--lh-faint);
  font-size: 0.88rem;
  font-style: italic;
  line-height: 1.45;
}

.empty-state {
  padding: 2rem 1.2rem;
  text-align: center;
}

.empty-title,
.placeholder-title {
  margin: 0;
  color: var(--lh-ink);
  font-weight: 750;
}

.empty-state .status {
  margin-top: 0.35rem;
}

.pair-list {
  list-style: none;
  margin: 0;
  padding: 0.9rem 1rem 1.1rem;
  display: grid;
  gap: 0.85rem;
}

.pair-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  align-items: stretch;
}

.card {
  min-height: 100%;
  padding: 0.9rem 0.95rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.85rem;
  background: rgba(16, 20, 26, 0.48);
  display: flex;
  flex-direction: column;
}

.card.placeholder {
  justify-content: center;
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.top strong {
  color: var(--lh-ink);
  font-size: 0.95rem;
  font-weight: 750;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: flex-end;
}

.chip {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
  border: 1px solid rgba(196, 165, 116, 0.22);
  white-space: nowrap;
}

.chip.pending {
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
}

.chip.done,
.chip.score {
  color: var(--lh-accent);
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.28);
}

.meta {
  margin-top: 0.3rem;
  font-size: 0.82rem;
  color: var(--lh-muted);
}

.meta.faint {
  margin-top: auto;
  padding-top: 0.65rem;
  color: var(--lh-faint);
}

.people {
  margin-top: 0.45rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--lh-ink);
}

.sep {
  color: var(--lh-faint);
  font-weight: 500;
}

.progress,
.body {
  margin-top: 0.45rem;
  color: var(--lh-ink);
  font-size: 0.88rem;
  line-height: 1.5;
}

.section-label {
  margin: 0.65rem 0 0.2rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.placeholder-title {
  font-size: 0.95rem;
}

.card > .status {
  margin-top: 0.35rem;
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
  .column-heads,
  .pair-row {
    grid-template-columns: 1fr;
  }

  .pair-count {
    justify-self: start;
  }

  .column-head + .column-head {
    padding-top: 0.75rem;
    border-top: 1px solid var(--lh-line);
  }
}
</style>
