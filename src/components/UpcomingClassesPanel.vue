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
          <div class="chips">
            <span class="chip status" :data-status="item.status">{{
              item.statusLabel || formatStatus(item.status)
            }}</span>
            <span v-if="item.isArchived || item.archivedAt" class="chip archived">Archived</span>
            <span class="chip">{{ item.durationMinutes }} min</span>
          </div>
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
        <div
          v-if="
            allowJoin &&
            (item.status === 'scheduled' || item.status === 'in_progress')
          "
          class="provider-pick"
        >
          <label :for="`provider-${item.id}`">Video platform</label>
          <div class="provider-row">
            <select
              :id="`provider-${item.id}`"
              :value="draftProviders[item.id] ?? item.meetingProvider ?? defaultProvider"
              :disabled="updatingProviderId === item.id || joiningId === item.id"
              @change="onProviderChange(item, ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in providerOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <span v-if="updatingProviderId === item.id" class="provider-saving">Saving…</span>
          </div>
        </div>
        <p v-else-if="item.meetingProvider" class="meta provider">
          Platform: {{ formatProvider(item.meetingProvider) }}
        </p>
        <p v-if="item.curriculumPlan" class="meta">Curriculum: {{ item.curriculumPlan }}</p>
        <p
          v-if="item.attendanceStatus && item.attendanceStatus !== 'not_recorded'"
          class="meta"
        >
          Attendance: {{ item.attendanceStatusLabel || item.attendanceStatus }}
        </p>
        <p
          v-if="item.participationLevel && item.participationLevel !== 'not_recorded'"
          class="meta"
        >
          Participation: {{ item.participationLevelLabel || item.participationLevel }}
          <span v-if="item.participationNotes"> · {{ item.participationNotes }}</span>
        </p>
        <a
          v-if="item.recordingUrl"
          class="meet-link"
          :href="item.recordingUrl"
          target="_blank"
          rel="noreferrer"
        >
          Watch lesson recording
        </a>

        <div v-if="allowJoin" class="join-row">
          <button
            v-if="item.canJoin && item.status !== 'completed' && item.status !== 'cancelled'"
            type="button"
            class="join-btn"
            :disabled="joiningId === item.id"
            @click="emit('join', item, draftProviders[item.id] || item.meetingProvider || undefined)"
          >
            {{ joiningId === item.id ? 'Joining…' : item.status === 'in_progress' ? 'Rejoin class' : 'Join class' }}
          </button>
          <p v-else-if="item.status === 'scheduled'" class="join-hint">
            {{ item.joinReason || 'Join opens near the scheduled start time.' }}
          </p>
          <a
            v-if="item.meetingLink && item.status === 'in_progress'"
            class="meet-link"
            :href="item.meetingLink"
            target="_blank"
            rel="noreferrer"
          >
            Open meeting link
          </a>
        </div>
        <a
          v-else-if="item.meetingLink"
          class="meet-link"
          :href="item.meetingLink"
          target="_blank"
          rel="noreferrer"
        >
          Open meeting link
        </a>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import type { ConfirmedSchedule } from '../stores/classes'
import { useSettingsStore } from '../stores/settings'
import { enabledProviderOptions, providerLabel } from '../constants/videoProviders'

const props = defineProps<{
  title: string
  subtitle: string
  emptyText: string
  items: ConfirmedSchedule[]
  loading?: boolean
  showTeacher?: boolean
  showStudent?: boolean
  allowJoin?: boolean
  joiningId?: number | null
  updatingProviderId?: number | null
}>()

const settingsStore = useSettingsStore()
const providerOptions = computed(() =>
  enabledProviderOptions(settingsStore.settings['meetings.enabled_providers']),
)
const defaultProvider = computed(() => {
  const value = String(settingsStore.settings['meetings.default_provider'] || '')
  return providerOptions.value.some((option) => option.value === value)
    ? value
    : providerOptions.value[0]?.value || 'jitsi'
})

onMounted(() => {
  if (!Object.keys(settingsStore.settings).length) {
    void settingsStore.fetchPublic().catch(() => undefined)
  }
})

const emit = defineEmits<{
  join: [item: ConfirmedSchedule, meetingProvider?: string]
  'update-provider': [item: ConfirmedSchedule, meetingProvider: string]
}>()

const draftProviders = reactive<Record<number, string>>({})

watch(
  () => props.items,
  (items) => {
    for (const item of items) {
      // Keep the draft in sync after a successful server update.
      if (item.meetingProvider) {
        draftProviders[item.id] = item.meetingProvider
      }
    }
  },
  { immediate: true, deep: true },
)

function onProviderChange(item: ConfirmedSchedule, value: string) {
  draftProviders[item.id] = value
  if (value && value !== item.meetingProvider) {
    emit('update-provider', item, value)
  }
}

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

function formatStatus(status: string) {
  if (status === 'in_progress') return 'In Progress'
  if (status === 'scheduled') return 'Scheduled'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatProvider(provider: string) {
  return providerLabel(provider)
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
.chip,
.join-btn,
.join-hint,
.provider-pick,
.provider-row,
.provider-saving {
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

.chips {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chip {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
  padding: 0.18rem 0.45rem;
  border-radius: 0.4rem;
  white-space: nowrap;
}

.chip.status[data-status='scheduled'] {
  color: var(--lh-accent);
  background: var(--lh-accent-soft);
}

.chip.status[data-status='in_progress'] {
  color: #9fd4c0;
  background: rgba(79, 143, 123, 0.18);
}

.chip.status[data-status='completed'] {
  color: var(--lh-faint);
  background: rgba(148, 163, 184, 0.1);
}

.chip.archived {
  color: var(--lh-accent);
  background: var(--lh-accent-soft);
}

.meta {
  font-size: 0.86rem;
}

.provider {
  text-transform: none;
}

.provider-pick {
  margin-top: 0.55rem;
  display: grid;
  gap: 0.3rem;
}

.provider-pick label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--lh-muted);
}

.provider-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.provider-pick select {
  min-width: 11rem;
  padding: 0.45rem 0.6rem;
  border-radius: 0.5rem;
  border: 1px solid var(--lh-line);
  background: var(--lh-input);
  color: var(--lh-ink);
  font-size: 0.86rem;
  font-weight: 600;
}

.provider-saving {
  font-size: 0.8rem;
  color: var(--lh-faint);
}

.join-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.55rem;
}

.join-btn {
  border: 0;
  border-radius: 0.55rem;
  padding: 0.45rem 0.85rem;
  background: linear-gradient(135deg, var(--lh-accent), var(--lh-accent-deep));
  color: #0c1210;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
}

.join-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}

.join-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}

.join-hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--lh-faint);
}

.meet-link {
  display: inline-block;
  margin-top: 0.15rem;
  color: var(--lh-accent);
  font-size: 0.86rem;
  font-weight: 700;
  text-decoration: none;
}

.meet-link:hover {
  text-decoration: underline;
}
</style>
