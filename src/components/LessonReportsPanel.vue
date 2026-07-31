<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <p class="kicker">Teacher records</p>
        <h2>{{ title }}</h2>
      </div>
      <p class="count">{{ items.length }}</p>
    </div>
    <p class="subtitle">{{ subtitle }}</p>

    <p v-if="loading" class="empty">Loading lesson reports…</p>
    <div v-else-if="!items.length" class="empty-state">
      <p class="empty-title">No reports yet</p>
      <p class="empty">{{ emptyText }}</p>
    </div>

    <ul v-else class="report-list">
      <li v-for="item in items" :key="item.id">
        <div class="top">
          <strong>{{ item.lessonTopic }}</strong>
          <div class="chips">
            <span class="chip">{{ item.attendanceStatusLabel }}</span>
            <span v-if="item.hasFeedback" class="chip done">Feedback in</span>
            <span v-else-if="item.needsFeedback" class="chip pending">Awaiting feedback</span>
          </div>
        </div>
        <p class="meta">
          {{ formatDate(item.reportDate) }} · {{ item.reportTime }}
          <span v-if="item.classSubject"> · {{ item.classSubject }}</span>
        </p>
        <div v-if="showTeacher || showStudent" class="people">
          <span v-if="showTeacher && item.teacher">{{ item.teacher.fullName }}</span>
          <span v-if="showTeacher && showStudent && item.teacher && item.student" class="sep"
            >→</span
          >
          <span v-if="showStudent && item.student">{{ item.student.fullName }}</span>
        </div>
        <p v-if="item.pagesDiscussed" class="meta">Pages: {{ item.pagesDiscussed }}</p>
        <p v-if="item.homeworkAssigned" class="meta">Homework: {{ item.homeworkAssigned }}</p>
        <p v-if="item.remarks" class="meta">Remarks: {{ item.remarks }}</p>
        <p class="progress">{{ item.studentProgress }}</p>
        <p v-if="item.submittedAt" class="meta faint">
          Submitted {{ formatDateTime(item.submittedAt) }}
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { LessonReport } from '../stores/lessonReports'

defineProps<{
  title: string
  subtitle: string
  emptyText: string
  items: LessonReport[]
  loading?: boolean
  showTeacher?: boolean
  showStudent?: boolean
}>()

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
.panel {
  height: 100%;
  padding: 1.15rem 1.15rem 1.25rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.05rem;
  background:
    linear-gradient(165deg, rgba(36, 44, 54, 0.5), transparent 40%),
    var(--lh-panel);
  backdrop-filter: blur(10px);
  animation: rise 0.45s ease both;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 0.75rem;
}

.kicker {
  font-family: 'Manrope', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
  margin: 0;
}

h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.28rem;
  font-weight: 550;
  color: var(--lh-ink);
  margin: 0.15rem 0 0;
}

.count {
  font-family: 'Manrope', sans-serif;
  font-size: 0.82rem;
  font-weight: 750;
  color: var(--lh-faint);
  font-variant-numeric: tabular-nums;
}

.subtitle,
.empty,
.empty-title,
.meta,
.progress,
.people,
strong,
.chip {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  margin-top: 0.4rem;
  color: var(--lh-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.empty-state {
  margin-top: 1rem;
  padding: 1.15rem 0.85rem;
  border-top: 1px solid var(--lh-line);
  text-align: center;
}

.empty-title {
  color: var(--lh-ink);
  font-weight: 750;
  font-size: 0.95rem;
}

.empty {
  margin-top: 0.35rem;
  color: var(--lh-faint);
  font-style: italic;
  font-size: 0.88rem;
}

.report-list {
  list-style: none;
  display: grid;
  gap: 0.65rem;
  margin-top: 0.95rem;
}

.report-list li {
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.8rem;
  background: rgba(16, 20, 26, 0.45);
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

.chip.done {
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

.progress {
  margin-top: 0.55rem;
  color: var(--lh-ink);
  font-size: 0.88rem;
  line-height: 1.5;
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
</style>
