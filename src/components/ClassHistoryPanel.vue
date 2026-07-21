<template>
  <section class="panel">
    <h2>{{ title }}</h2>
    <p>{{ subtitle }}</p>

    <p v-if="loading" class="empty">Loading archived history...</p>
    <p v-else-if="!items.length" class="empty">{{ emptyText }}</p>

    <ul v-else class="history-list">
      <li v-for="item in items" :key="item.id">
        <div class="top">
          <strong>{{ item.lessonTopic || item.title }}</strong>
          <div class="chips">
            <span class="chip status">Completed</span>
            <span class="chip archived">Archived</span>
          </div>
        </div>
        <p class="meta">
          {{ formatDate(item.classDate) }}
          ·
          {{ formatTimeRange(item.startTime, item.endTime, item.timeSlot) }}
        </p>
        <p v-if="showTeacher && item.teacher" class="meta">
          Teacher: {{ item.teacher.fullName }}
          <span v-if="item.subject"> · {{ item.subject }}</span>
        </p>
        <p v-if="showStudent && item.student" class="meta">
          Student: {{ item.student.fullName }}
          <span v-if="item.subject"> · {{ item.subject }}</span>
        </p>
        <p
          v-if="item.attendanceStatus && item.attendanceStatus !== 'not_recorded'"
          class="meta"
        >
          Attendance: {{ item.attendanceStatusLabel || item.attendanceStatus }}
        </p>
        <p v-if="item.homeworkAssigned" class="meta">Homework: {{ item.homeworkAssigned }}</p>
        <p v-if="item.studentProgress" class="progress">{{ item.studentProgress }}</p>
        <p v-if="item.studentFeedbackRating != null" class="meta">
          Student feedback: {{ item.studentFeedbackRating }}/5
        </p>
        <p v-if="item.archivedAt" class="meta faint">
          Archived {{ formatDateTime(item.archivedAt) }}
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { ConfirmedSchedule } from '../stores/classes'

defineProps<{
  title: string
  subtitle: string
  emptyText: string
  items: ConfirmedSchedule[]
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

function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  timeSlot: string,
) {
  if (startTime && endTime) return `${startTime} – ${endTime}`
  return timeSlot.replace('-', ' – ')
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
.progress,
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

.history-list {
  list-style: none;
  display: grid;
  gap: 0.7rem;
  margin-top: 0.9rem;
}

.history-list li {
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: flex-end;
}

.chip {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: 0.4rem;
  white-space: nowrap;
}

.chip.status {
  color: var(--lh-faint);
  background: rgba(148, 163, 184, 0.12);
}

.chip.archived {
  color: var(--lh-accent);
  background: var(--lh-accent-soft);
}

.meta {
  font-size: 0.86rem;
}

.meta.faint {
  color: var(--lh-faint);
}

.progress {
  margin-top: 0.5rem;
  color: var(--lh-ink);
  font-size: 0.9rem;
}
</style>
