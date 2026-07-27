<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUsersStore, type ManagedUser } from '../../stores/users'
import { initialsFrom } from '../../utils/initials'
import { usePageEyebrow } from '../../composables/usePageMeta'
import AdminUsersPanel from '../../components/AdminUsersPanel.vue'

type Tab = 'teacher' | 'student' | 'admin'

const usersStore = useUsersStore()
const { users, loading, error } = storeToRefs(usersStore)

const tab = ref<Tab>('teacher')
const search = ref('')
const subject = ref('')
const showManage = ref(false)

const byRole = (role: Tab) => users.value.filter((user) => user.role === role)

const subjects = computed(() => {
  const found = new Set(
    byRole('teacher')
      .map((teacher) => teacher.subjectExpertise)
      .filter(Boolean),
  )
  return [...found].sort()
})

const rows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return byRole(tab.value).filter((user) => {
    if (subject.value && user.subjectExpertise !== subject.value) return false
    if (!term) return true
    return (
      user.fullName.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term) ||
      user.subjectExpertise.toLowerCase().includes(term)
    )
  })
})

usePageEyebrow(() => {
  const teachers = byRole('teacher').length
  const students = byRole('student').length
  return `${teachers} teacher${teachers === 1 ? '' : 's'} · ${students} student${students === 1 ? '' : 's'}`
})

/** The design draws load against a 20h week. */
const WEEKLY_TARGET_MINUTES = 20 * 60

function loadPercent(user: ManagedUser) {
  if (!user.weeklyMinutes) return 0
  return Math.min(100, Math.round((user.weeklyMinutes / WEEKLY_TARGET_MINUTES) * 100))
}

function formatHours(minutes: number | null) {
  if (minutes == null) return '—'
  if (minutes === 0) return '0h'
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

function calendarLabel(user: ManagedUser) {
  if (user.calendarProvider === 'google') return 'Google synced'
  if (user.calendarProvider === 'calendly') return 'Calendly synced'
  return 'Not connected'
}

async function load() {
  try {
    await usersStore.fetchAll()
  } catch {
    // store sets error; surfaced in the table body
  }
}

onMounted(() => {
  if (!users.value.length) load()
})
</script>

<template>
  <section class="people">
    <nav class="tabs" aria-label="Directory">
      <button
        v-for="item in [
          { id: 'teacher' as Tab, label: 'Teachers' },
          { id: 'student' as Tab, label: 'Students' },
          { id: 'admin' as Tab, label: 'Admins' },
        ]"
        :key="item.id"
        type="button"
        class="tab"
        :class="{ active: tab === item.id }"
        :aria-current="tab === item.id ? 'true' : undefined"
        @click="tab = item.id"
      >
        {{ item.label }}
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
        <input v-model="search" type="search" placeholder="Search by name or subject" />
      </label>

      <button type="button" class="pill" :class="{ active: !subject }" @click="subject = ''">
        All subjects
      </button>
      <button
        v-for="name in subjects"
        :key="name"
        type="button"
        class="pill"
        :class="{ active: subject === name }"
        @click="subject = subject === name ? '' : name"
      >
        {{ name }}
      </button>

      <button type="button" class="btn-primary manage-toggle" @click="showManage = !showManage">
        {{ showManage ? 'Close' : 'Add teacher' }}
      </button>
    </div>

    <div v-if="showManage" class="manage-slot">
      <AdminUsersPanel />
    </div>

    <div class="table" role="table">
      <div class="row head" role="row">
        <span role="columnheader">{{
          tab === 'teacher' ? 'Teacher' : tab === 'student' ? 'Student' : 'Admin'
        }}</span>
        <span role="columnheader">Subject</span>
        <span role="columnheader">This week</span>
        <span role="columnheader">Students</span>
        <span role="columnheader">Calendar</span>
        <span class="col-action" role="columnheader"><span class="sr-only">Actions</span></span>
      </div>

      <p v-if="loading" class="state">Loading directory…</p>
      <div v-else-if="error" class="state state-error" role="alert">
        <span>{{ error }}</span>
        <button type="button" class="btn-ghost" @click="load()">Retry</button>
      </div>
      <p v-else-if="!rows.length" class="state">
        {{ users.length ? 'No one matches that filter.' : 'No accounts yet.' }}
      </p>

      <div v-for="user in rows" v-else :key="user.id" class="row" role="row">
        <div class="who" role="cell">
          <span class="avatar" aria-hidden="true">{{ initialsFrom(user.fullName) }}</span>
          <div class="who-copy">
            <p class="name">{{ user.fullName }}</p>
            <p class="email">{{ user.email || user.username }}</p>
          </div>
        </div>

        <p class="cell" role="cell">{{ user.subjectExpertise || '—' }}</p>

        <div class="load" role="cell">
          <span class="meter" aria-hidden="true">
            <span class="meter-fill" :style="{ width: `${loadPercent(user)}%` }" />
          </span>
          <p class="meta">{{ formatHours(user.weeklyMinutes) }}</p>
        </div>

        <p class="cell" role="cell">{{ user.studentCount ?? '—' }}</p>

        <div class="sync" role="cell">
          <span class="dot" :class="{ on: !!user.calendarProvider }" aria-hidden="true" />
          <p class="meta">{{ calendarLabel(user) }}</p>
        </div>

        <div class="col-action" role="cell">
          <button type="button" class="btn-ghost" @click="showManage = true">Manage</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.people {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--lh-line);
}

.tab {
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

.tab:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
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
  font-size: 12.5px;
}

.search input::placeholder {
  color: var(--lh-dim);
}

.search input:focus {
  outline: 0;
}

.search:focus-within {
  box-shadow: inset 0 0 0 1px var(--lh-accent);
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

.pill:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.manage-toggle {
  margin-left: auto;
}

.btn-primary {
  height: 31px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.btn-ghost {
  width: 80px;
  height: 27px;
  border: 0;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  background: transparent;
  color: var(--lh-muted);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.btn-ghost:hover {
  color: var(--lh-ink);
}

.btn-primary:focus-visible,
.btn-ghost:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.table {
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.row {
  display: grid;
  grid-template-columns: 1.7fr 1fr 1.2fr 1fr 1.1fr auto;
  gap: 16px;
  align-items: center;
  padding: 13px 18px;
  border-top: 1px solid var(--lh-line);
  transition: background var(--lh-ease);
}

.row:not(.head):hover {
  background: var(--lh-bg-elevated);
}

.row.head {
  padding: 10px 18px;
  border-top: 0;
  background: var(--lh-rail);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.col-action {
  width: 80px;
}

.who {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-size: 10.5px;
  font-weight: 800;
}

.who-copy {
  min-width: 0;
}

.name {
  font-size: 13.5px;
  font-weight: 700;
}

.email {
  font-size: 11px;
  color: var(--lh-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell {
  font-size: 13px;
  color: var(--lh-muted);
}

.load {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meter {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  overflow: hidden;
}

.meter-fill {
  display: block;
  height: 100%;
  background: var(--lh-accent);
}

.meta {
  font-size: 11.5px;
  color: var(--lh-muted);
}

.sync {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lh-ghost);
}

.dot.on {
  background: var(--lh-accent);
}

.state {
  padding: 18px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

.state-error {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.manage-slot {
  min-width: 0;
}

@media (max-width: 1000px) {
  .row {
    grid-template-columns: 1.6fr 1fr 1fr auto;
  }

  .row > :nth-child(4),
  .row > :nth-child(5) {
    display: none;
  }
}
</style>
