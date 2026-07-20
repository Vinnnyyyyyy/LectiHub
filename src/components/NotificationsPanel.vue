<template>
  <section class="panel">
    <div class="section-head">
      <h2>
        Notifications
        <span v-if="unreadCount" class="badge">{{ unreadCount }}</span>
      </h2>
      <button
        v-if="notifications.length"
        type="button"
        class="text-btn"
        @click="markAllRead"
      >
        Mark all read
      </button>
    </div>

    <p class="subtitle">{{ subtitle }}</p>

    <div v-if="showPendingReminders && pendingReminders.length" class="pending">
      <p class="field-label">Upcoming reminders</p>
      <ul class="pending-list">
        <li v-for="item in pendingReminders" :key="item.id">
          <strong>{{ item.title }}</strong>
          <p>
            Delivers
            {{ formatDateTime(item.deliverAt) }}
            <span v-if="item.details?.teacherName">
              · {{ item.details.teacherName }}
            </span>
          </p>
        </li>
      </ul>
    </div>

    <p v-if="loading" class="empty">Loading notifications...</p>
    <p v-else-if="!notifications.length" class="empty">{{ emptyText }}</p>
    <ul v-else class="notice-list">
      <li
        v-for="item in notifications"
        :key="item.id"
        :class="{ unread: !item.isRead, reminder: item.type === 'class_reminder' }"
      >
        <button type="button" class="notice-btn" @click="handleSelect(item)">
          <div class="title-row">
            <strong>{{ item.title }}</strong>
            <span v-if="item.type === 'class_reminder'" class="chip">Reminder</span>
          </div>
          <pre class="message">{{ item.message }}</pre>

          <div v-if="item.details" class="details">
            <p v-if="item.details.teacherName">
              Assigned teacher: {{ item.details.teacherName }}
            </p>
            <p v-if="item.details.studentName">
              Assigned student: {{ item.details.studentName }}
            </p>
            <p v-if="item.details.classDate">
              Schedule:
              {{ item.details.classDate }}
              {{
                item.details.startTime && item.details.endTime
                  ? `${item.details.startTime} – ${item.details.endTime}`
                  : item.details.timeSlot || ''
              }}
              <span v-if="item.details.durationMinutes">
                ({{ item.details.durationMinutes }} minutes)
              </span>
            </p>
            <p v-if="item.details.meetingInfo">
              Meeting information: {{ item.details.meetingInfo }}
            </p>
            <a
              v-if="item.details.meetingLink"
              class="meet-link"
              :href="item.details.meetingLink"
              target="_blank"
              rel="noreferrer"
              @click.stop
            >
              Open meeting link
            </a>
          </div>

          <time>{{ formatDateTime(item.createdAt) }}</time>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import {
  useNotificationsStore,
  type AppNotification,
} from '../stores/notifications'

withDefaults(
  defineProps<{
    subtitle?: string
    emptyText?: string
    showPendingReminders?: boolean
  }>(),
  {
    subtitle: 'Updates about schedule confirmations and assignments.',
    emptyText: 'You’re all caught up.',
    showPendingReminders: false,
  },
)

const emit = defineEmits<{
  select: [item: AppNotification]
}>()

const notificationsStore = useNotificationsStore()
const { notifications, pendingReminders, unreadCount, loading } =
  storeToRefs(notificationsStore)

function formatDateTime(value: string) {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function handleSelect(item: AppNotification) {
  if (!item.isRead) {
    try {
      await notificationsStore.markRead(item.id)
    } catch {
      // still emit select
    }
  }
  emit('select', item)
}

async function markAllRead() {
  await notificationsStore.markAllRead()
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

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
  font-family: 'Manrope', sans-serif;
  font-size: 0.75rem;
  font-weight: 800;
}

.subtitle,
.empty,
.notice-btn,
.text-btn,
time,
p,
a,
strong {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  color: var(--lh-muted);
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.pending {
  margin-bottom: 0.85rem;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.55);
}

.field-label {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--lh-warm);
  margin-bottom: 0.4rem;
}

.pending-list {
  list-style: none;
  display: grid;
  gap: 0.4rem;
}

.pending-list p {
  font-size: 0.84rem;
  color: var(--lh-muted);
}

.title-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.chip {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
}

.notice-list li.reminder .notice-btn {
  border-color: rgba(196, 165, 116, 0.35);
}

.text-btn {
  border: 1px solid var(--lh-line);
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  border-radius: 0.55rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.empty {
  margin-top: 0.75rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-style: italic;
  font-size: 0.9rem;
}

.notice-list {
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.notice-btn {
  width: 100%;
  text-align: left;
  border-radius: 0.75rem;
  padding: 0.75rem 0.8rem;
  display: grid;
  gap: 0.35rem;
  border: 1px solid var(--lh-line);
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
}

.notice-list li.unread .notice-btn {
  border-color: rgba(126, 184, 164, 0.35);
  background: var(--lh-accent-soft);
}

.message {
  margin: 0;
  white-space: pre-wrap;
  font-family: 'Manrope', sans-serif;
  font-size: 0.88rem;
  color: var(--lh-muted);
  line-height: 1.45;
}

.details {
  display: grid;
  gap: 0.15rem;
  padding-top: 0.25rem;
}

.details p {
  font-size: 0.84rem;
  color: var(--lh-muted);
}

.meet-link {
  color: var(--lh-accent);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
  width: fit-content;
}

.meet-link:hover {
  text-decoration: underline;
}

time {
  font-size: 0.78rem;
  color: var(--lh-faint);
}
</style>
