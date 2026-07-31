<script setup lang="ts">
/**
 * Audit log (admin 08). Every state change, newest first, filtered by
 * category, actor, free text and a day window.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuditStore, type AuditCategory } from '../../stores/audit'
import { formatDateTime, relativeTime } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

const auditStore = useAuditStore()
const { events, total, byCategory, loading, error } = storeToRefs(auditStore)

const CATEGORIES: { id: AuditCategory | ''; label: string }[] = [
  { id: '', label: 'All events' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'materials', label: 'Materials' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'settings', label: 'Settings' },
]

const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 0, label: 'All time' },
]

const category = ref<AuditCategory | ''>('')
const days = ref(7)
const search = ref('')

let searchTimer: ReturnType<typeof setTimeout> | undefined

function load() {
  void auditStore.fetch({
    category: category.value,
    days: days.value || undefined,
    search: search.value.trim() || undefined,
  })
}

watch([category, days], load)

// Debounced so typing doesn't fire a request per keystroke.
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
})

usePageEyebrow(() => {
  const retention = 24
  return `${total.value} event${total.value === 1 ? '' : 's'} · retained ${retention} months`
})

function categoryCount(id: AuditCategory | '') {
  if (!id) return total.value
  return Number(byCategory.value[id] ?? 0)
}

const grouped = computed(() => {
  const map = new Map<string, typeof events.value>()
  for (const event of events.value) {
    const day = String(event.createdAt).slice(0, 10)
    const bucket = map.get(day)
    if (bucket) bucket.push(event)
    else map.set(day, [event])
  }
  return [...map.entries()]
})

function dayLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - date.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

function timeOf(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return formatDateTime(value)
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

onMounted(load)
</script>

<template>
  <section class="audit">
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <nav class="tabs" aria-label="Event categories">
      <button
        v-for="item in CATEGORIES"
        :key="item.id || 'all'"
        type="button"
        class="tab"
        :class="{ active: category === item.id }"
        :aria-current="category === item.id ? 'true' : undefined"
        @click="category = item.id"
      >
        {{ item.label }}
        <span v-if="categoryCount(item.id)" class="count">{{ categoryCount(item.id) }}</span>
      </button>
    </nav>

    <div class="toolbar">
      <label class="search">
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input v-model="search" type="search" placeholder="Filter by actor or entity" />
      </label>

      <div class="windows">
        <button
          v-for="item in WINDOWS"
          :key="item.days"
          type="button"
          class="pill"
          :class="{ active: days === item.days }"
          @click="days = item.days"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="empty">Reading the log…</p>
    <p v-else-if="!events.length" class="empty">
      {{ search || category ? 'Nothing matches those filters.' : 'Nothing logged yet.' }}
    </p>

    <div v-else class="log">
      <div v-for="[day, items] in grouped" :key="day" class="day">
        <p class="day-label">{{ dayLabel(day) }}</p>

        <div class="table">
          <div class="row head">
            <span>When</span><span>Event</span><span>Actor</span><span>Type</span>
          </div>
          <div v-for="event in items" :key="event.id" class="row">
            <span class="when" :title="formatDateTime(event.createdAt)">
              {{ timeOf(event.createdAt) }}
            </span>
            <span class="what">
              {{ event.description }}
              <span class="ago">{{ relativeTime(event.createdAt) }}</span>
            </span>
            <span class="actor" :class="{ system: !event.actorId }">{{ event.actorName }}</span>
            <span>
              <span class="tag" :class="event.category">{{ event.category }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.audit {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.banner.error {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
  font-size: 12.5px;
}

.tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--lh-line);
  flex-wrap: wrap;
}

.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 0 11px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.tab:hover {
  color: var(--lh-ink);
}

.tab.active {
  border-bottom-color: var(--lh-accent);
  color: var(--lh-accent);
  font-weight: 700;
}

.count {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  font-size: 10px;
  font-weight: 800;
}

.tab.active .count {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.tab:focus-visible,
.pill:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 280px;
  height: 31px;
  padding: 0 11px;
  border-radius: var(--lh-radius-control);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-dim);
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
}

.search input:focus {
  outline: 0;
}

.search:focus-within {
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.windows {
  margin-left: auto;
  display: flex;
  gap: 5px;
}

.pill {
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.pill.active {
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  color: var(--lh-ink);
  font-weight: 700;
}

.log {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.day-label {
  margin-bottom: 9px;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.table {
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.row {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr) 9rem 8rem;
  gap: 14px;
  align-items: center;
  padding: 11px 16px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  transition: background var(--lh-ease);
}

.row:not(.head):hover {
  background: var(--lh-bg-elevated);
}

.row.head {
  padding: 9px 16px;
  border-top: 0;
  background: var(--lh-rail);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.when {
  font-variant-numeric: tabular-nums;
  color: var(--lh-muted);
}

.what {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.ago {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--lh-ghost);
}

.actor {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actor.system {
  color: var(--lh-faint);
  font-weight: 500;
  font-style: italic;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: capitalize;
  background: var(--lh-chip);
  color: var(--lh-faint);
}

.tag.scheduling {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.tag.accounts {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.tag.settings {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.empty {
  padding: 24px 0;
  font-size: 12.5px;
  color: var(--lh-muted);
}

@media (max-width: 900px) {
  .row {
    grid-template-columns: 4.5rem minmax(0, 1fr) 7rem;
  }

  .row > :nth-child(4) {
    display: none;
  }
}
</style>
