<template>
  <section class="panel">
    <h2>{{ title }}</h2>
    <p>{{ subtitle }}</p>

    <p v-if="loading" class="empty">Loading schedules...</p>
    <p v-else-if="!items.length" class="empty">{{ emptyText }}</p>
    <ul v-else class="class-list">
      <li v-for="item in items" :key="item.id">
        <div class="class-top">
          <strong>{{ item.title }}</strong>
          <span class="chip">{{ item.durationMinutes }} min</span>
        </div>
        <p>
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
        <p v-if="item.meetingInfo" class="meta">{{ item.meetingInfo }}</p>
        <a v-if="item.meetingLink" class="meet-link" :href="item.meetingLink" target="_blank" rel="noreferrer">
          Open meeting link
        </a>
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

function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
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
a,
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

.class-list {
  list-style: none;
  display: grid;
  gap: 0.65rem;
  margin-top: 0.9rem;
}

.class-list li {
  padding: 0.75rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.65);
}

.class-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.chip {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  white-space: nowrap;
}

.meta {
  font-size: 0.86rem;
}

.meet-link {
  display: inline-block;
  margin-top: 0.45rem;
  color: var(--lh-accent);
  font-size: 0.86rem;
  font-weight: 700;
  text-decoration: none;
}

.meet-link:hover {
  text-decoration: underline;
}
</style>
