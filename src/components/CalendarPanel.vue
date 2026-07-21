<template>
  <section class="panel">
    <div class="section-head">
      <h2>{{ title }}</h2>
    </div>
    <p class="subtitle">{{ subtitle }}</p>

    <p v-if="loading" class="empty">Loading calendar...</p>
    <p v-else-if="!events.length" class="empty">{{ emptyText }}</p>
    <ul v-else class="event-list">
      <li v-for="item in events" :key="item.id">
        <div class="event-top">
          <strong>{{ item.title }}</strong>
          <span class="chip" :data-provider="item.provider">{{ item.provider }}</span>
        </div>
        <p>
          {{ formatDate(item.eventDate) }}
          · {{ item.startTime }} – {{ item.endTime }}
          · {{ item.durationMinutes }} min
        </p>
        <p v-if="item.meetingInfo" class="meta">{{ item.meetingInfo }}</p>
        <p class="meta">
          Sync:
          <span :data-status="item.syncStatus">{{ item.syncStatus.replace('_', ' ') }}</span>
          <span v-if="item.externalEventId"> · {{ item.externalEventId }}</span>
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { CalendarEvent } from '../stores/calendar'

defineProps<{
  title?: string
  subtitle?: string
  emptyText?: string
  events: CalendarEvent[]
  loading?: boolean
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
</script>

<style scoped>
.panel {
  padding: 1.2rem 1.15rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
}

.section-head h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

.subtitle,
.empty,
p,
strong,
.chip,
.meta {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.9rem;
}

.empty {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-style: italic;
  font-size: 0.9rem;
}

.event-list {
  list-style: none;
  display: grid;
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.event-list li {
  padding: 0.75rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.62);
}

.event-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.chip {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  padding: 0.15rem 0.4rem;
  border-radius: 0.4rem;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.chip[data-provider='google'] {
  background: rgba(66, 133, 244, 0.16);
  color: #8ab4f8;
}

.chip[data-provider='calendly'] {
  background: rgba(0, 107, 255, 0.14);
  color: #6ea8fe;
}

p {
  margin-top: 0.3rem;
  color: var(--lh-muted);
  font-size: 0.88rem;
}

.meta {
  font-size: 0.82rem;
}

.meta span[data-status='synced'] {
  color: var(--lh-accent);
  font-weight: 700;
}

.meta span[data-status='failed'] {
  color: var(--lh-danger);
  font-weight: 700;
}
</style>
