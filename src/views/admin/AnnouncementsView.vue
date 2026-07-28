<script setup lang="ts">
/**
 * Inbox & alerts (admin). The reference's screen 07 is Announcements — compose,
 * audience targeting, templates, scheduling — but /api/notifications is
 * read-only (list + mark read), so none of the compose half has a backend.
 * This is the receiving half, in the same visual language.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAdminScheduleStore } from '../../stores/adminSchedule'
import { useNotificationsStore, type AppNotification } from '../../stores/notifications'
import { relativeTime } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

const notificationsStore = useNotificationsStore()
const adminStore = useAdminScheduleStore()
const router = useRouter()

const { notifications, loading } = storeToRefs(notificationsStore)

const showUnreadOnly = ref(false)
const openingId = ref<number | null>(null)

const unreadCount = computed(() => notifications.value.filter((item) => !item.isRead).length)

const visible = computed(() =>
  showUnreadOnly.value ? notifications.value.filter((item) => !item.isRead) : notifications.value,
)

usePageEyebrow(() => (unreadCount.value ? `${unreadCount.value} unread` : 'Everything read'))

/** Type slug → the eyebrow and tone the design uses for each kind of alert. */
function kind(item: AppNotification): { label: string; tone: 'accent' | 'warm' | 'danger' } {
  const type = (item.type || '').toLowerCase()
  if (type.includes('request') || type.includes('trial'))
    return { label: 'Booking request', tone: 'warm' }
  if (type.includes('assign') || type.includes('confirm'))
    return { label: 'Class confirmed', tone: 'accent' }
  if (type.includes('report')) return { label: 'Lesson report', tone: 'accent' }
  if (type.includes('cancel') || type.includes('reject') || type.includes('absent'))
    return { label: 'Needs attention', tone: 'danger' }
  return { label: item.type?.replace(/[_-]/g, ' ') || 'Alert', tone: 'accent' }
}

async function openRelated(item: AppNotification) {
  if (!item.isRead) void notificationsStore.markRead(item.id)
  if (!item.relatedRequestId) return

  openingId.value = item.id
  try {
    await adminStore.fetchRequestReview(item.relatedRequestId)
    await router.push('/admin/requests')
  } catch {
    // the requests screen surfaces the error
  } finally {
    openingId.value = null
  }
}

onMounted(() => {
  if (!notifications.value.length) void notificationsStore.fetchMine()
})
</script>

<template>
  <section class="alerts">
    <div class="toolbar">
      <div class="filters">
        <button
          type="button"
          class="pill"
          :class="{ active: !showUnreadOnly }"
          @click="showUnreadOnly = false"
        >
          All
        </button>
        <button
          type="button"
          class="pill"
          :class="{ active: showUnreadOnly }"
          @click="showUnreadOnly = true"
        >
          Unread <span v-if="unreadCount" class="count">{{ unreadCount }}</span>
        </button>
      </div>

      <button
        type="button"
        class="btn-ghost"
        :disabled="!unreadCount"
        @click="notificationsStore.markAllRead()"
      >
        Mark all read
      </button>
    </div>

    <p v-if="loading" class="state">Loading alerts…</p>
    <p v-else-if="!visible.length" class="state">
      {{ showUnreadOnly ? 'Nothing unread.' : 'No alerts yet.' }}
    </p>

    <div v-else class="list">
      <component
        :is="item.relatedRequestId ? 'button' : 'div'"
        v-for="item in visible"
        :key="item.id"
        :type="item.relatedRequestId ? 'button' : undefined"
        class="item"
        :class="{ unread: !item.isRead, actionable: !!item.relatedRequestId }"
        @click="item.relatedRequestId && openRelated(item)"
      >
        <span class="item-head">
          <span class="eyebrow" :class="kind(item).tone">{{ kind(item).label }}</span>
          <span v-if="!item.isRead" class="unread-dot" aria-hidden="true" />
          <span class="when">{{ relativeTime(item.createdAt) }}</span>
        </span>

        <span class="title">{{ item.title }}</span>
        <span v-if="item.message" class="message">{{ item.message }}</span>

        <span v-if="item.relatedRequestId" class="cta">
          {{ openingId === item.id ? 'Opening…' : 'Open in review queue →' }}
        </span>
      </component>
    </div>

    <p class="footnote">
      Composing announcements — audience targeting, templates and scheduling — needs a create/send
      endpoint that does not exist yet.
    </p>
  </section>
</template>

<style scoped>
.alerts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  max-width: 52rem;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 9px;
}

.filters {
  display: flex;
  gap: 5px;
}

.pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    color var(--lh-ease);
}

.pill:hover {
  color: var(--lh-ink);
}

.pill.active {
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  color: var(--lh-ink);
  font-weight: 700;
}

.count {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
  font-size: 10px;
  font-weight: 800;
}

.btn-ghost {
  margin-left: auto;
  height: 31px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.btn-ghost:hover:not(:disabled) {
  color: var(--lh-ink);
}

.btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pill:focus-visible,
.btn-ghost:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.list {
  display: flex;
  flex-direction: column;
}

.item {
  display: grid;
  gap: 6px;
  padding: 16px 0;
  border: 0;
  border-top: 1px solid var(--lh-line);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  width: 100%;
}

.item.actionable {
  cursor: pointer;
}

.item.actionable:hover .cta {
  color: var(--lh-accent-hover);
}

.item:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.item-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.eyebrow.accent {
  color: var(--lh-accent);
}

.eyebrow.warm {
  color: var(--lh-warm);
}

.eyebrow.danger {
  color: var(--lh-danger);
}

.unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lh-warm);
}

.when {
  margin-left: auto;
  font-size: 11px;
  color: var(--lh-dim);
}

.title {
  font-size: 14.5px;
  font-weight: 700;
}

.item:not(.unread) .title {
  color: var(--lh-muted);
  font-weight: 600;
}

.message {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lh-muted);
  text-wrap: pretty;
}

.cta {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--lh-accent);
  transition: color var(--lh-ease);
}

.state {
  padding: 18px 0;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

.footnote {
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid var(--lh-line);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--lh-dim);
}
</style>
