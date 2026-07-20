<template>
  <section class="panel">
    <h2>{{ title }}</h2>
    <p>{{ subtitle }}</p>

    <p v-if="loading" class="empty">Loading feedback...</p>
    <p v-else-if="!items.length" class="empty">{{ emptyText }}</p>

    <ul v-else class="feedback-list">
      <li v-for="item in items" :key="item.id">
        <div class="top">
          <strong>{{ item.lessonTopic || 'Lesson feedback' }}</strong>
          <span class="chip">{{ item.overallRating }}/5</span>
        </div>
        <p class="meta">
          <span v-if="item.reportDate">{{ formatDate(item.reportDate) }}</span>
          <span v-if="item.classSubject"> · {{ item.classSubject }}</span>
        </p>
        <p v-if="showStudent && item.student" class="meta">
          Student: {{ item.student.fullName }}
        </p>
        <p v-if="showTeacher && item.teacher" class="meta">
          Teacher: {{ item.teacher.fullName }}
        </p>
        <p class="section-label">Comments</p>
        <p class="body">{{ item.comments }}</p>
        <template v-if="item.suggestions">
          <p class="section-label">Suggestions</p>
          <p class="body">{{ item.suggestions }}</p>
        </template>
        <p class="section-label">Learning experience</p>
        <p class="body">{{ item.learningExperience }}</p>
        <p v-if="item.submittedAt" class="meta faint">
          Submitted {{ formatDateTime(item.submittedAt) }}
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { StudentFeedback } from '../stores/studentFeedback'

defineProps<{
  title: string
  subtitle: string
  emptyText: string
  items: StudentFeedback[]
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
  padding: 1.25rem 1.2rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
}

h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

p,
.empty,
.meta,
.body,
.section-label,
strong,
.chip {
  font-family: 'Manrope', sans-serif;
}

p {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

.empty {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-style: italic;
}

.feedback-list {
  list-style: none;
  display: grid;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.feedback-list li {
  padding: 0.8rem 0.85rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.65);
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.chip {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  color: #86efac;
  background: rgba(34, 197, 94, 0.14);
  white-space: nowrap;
}

.meta {
  font-size: 0.86rem;
}

.meta.faint {
  color: var(--lh-faint);
}

.section-label {
  margin-top: 0.65rem;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.body {
  margin-top: 0.2rem;
  color: var(--lh-ink);
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>
