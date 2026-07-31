<template>
  <section class="users">
    <aside class="sidebar" aria-label="Users sections">
      <div class="brand-block">
        <p class="kicker">Accounts</p>
        <h2>Users</h2>
        <p class="side-copy">Create teachers and manage every account from one place.</p>
      </div>

      <nav class="side-nav" role="tablist" aria-orientation="vertical">
        <button
          type="button"
          role="tab"
          class="side-link"
          :class="{ active: activeView === 'create' }"
          :aria-selected="activeView === 'create'"
          @click="activeView = 'create'"
        >
          <span class="side-label">New teacher</span>
        </button>

        <p class="nav-group">Directory</p>

        <button
          v-for="option in filters"
          :key="option.value"
          type="button"
          role="tab"
          class="side-link"
          :class="{ active: activeView === 'directory' && roleFilter === option.value }"
          :aria-selected="activeView === 'directory' && roleFilter === option.value"
          @click="openDirectory(option.value)"
        >
          <span class="side-label">{{ option.label }}</span>
          <span class="side-badge">{{ counts[option.value] }}</span>
        </button>
      </nav>
    </aside>

    <div class="main">
      <header class="main-head">
        <div>
          <p class="kicker">{{ activeMeta.kicker }}</p>
          <h3>{{ activeMeta.title }}</h3>
          <p class="main-copy">{{ activeMeta.copy }}</p>
        </div>
        <p v-if="activeView === 'directory'" class="count">{{ filteredUsers.length }} shown</p>
      </header>

      <div v-show="activeView === 'create'" class="view">
        <form class="create-card" @submit.prevent="handleCreateTeacher">
          <div class="form-grid">
            <label for="teacher-full-name">
              Full name
              <input
                id="teacher-full-name"
                v-model="form.fullName"
                type="text"
                required
                maxlength="120"
              />
            </label>
            <label for="teacher-username">
              Username
              <input
                id="teacher-username"
                v-model="form.username"
                type="text"
                required
                maxlength="60"
                autocomplete="off"
              />
            </label>
            <label for="teacher-email">
              Email
              <input id="teacher-email" v-model="form.email" type="email" maxlength="120" />
            </label>
            <label for="teacher-subject">
              Subject expertise
              <input
                id="teacher-subject"
                v-model="form.subjectExpertise"
                type="text"
                maxlength="120"
                placeholder="Math, Writing, Science…"
              />
            </label>
            <label for="teacher-password" class="span-2">
              Temporary password
              <input
                id="teacher-password"
                v-model="form.password"
                type="text"
                required
                minlength="6"
                maxlength="80"
                autocomplete="new-password"
              />
            </label>
          </div>

          <button type="submit" class="create" :disabled="creating">
            {{ creating ? 'Creating…' : 'Create teacher' }}
          </button>

          <p v-if="message" class="success" role="status">{{ message }}</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
        </form>
      </div>

      <div v-show="activeView === 'directory'" class="view">
        <p v-if="loading" class="hint">Loading directory…</p>
        <div v-else-if="!filteredUsers.length" class="empty-state">
          <p class="empty-title">No accounts here</p>
          <p class="hint">Nothing matches this directory filter.</p>
        </div>

        <div v-else class="table-card">
          <div class="table-head" aria-hidden="true">
            <span>Person</span>
            <span>Role</span>
            <span>Action</span>
          </div>
          <ul class="user-list">
            <li v-for="user in filteredUsers" :key="user.id">
              <div class="person">
                <span class="avatar" :data-role="user.role" aria-hidden="true">{{
                  initials(user.fullName)
                }}</span>
                <div class="person-text">
                  <strong>{{ user.fullName }}</strong>
                  <p>
                    <span class="handle">@{{ user.username }}</span>
                    <span v-if="user.email" class="dot">·</span>
                    <span v-if="user.email">{{ user.email }}</span>
                  </p>
                </div>
              </div>
              <span class="role" :data-role="user.role">{{ user.role }}</span>
              <button
                type="button"
                class="delete"
                :disabled="deletingId === user.id || user.username === currentUsername"
                @click="confirmDelete(user)"
              >
                {{ deletingId === user.id ? 'Deleting…' : 'Delete' }}
              </button>
            </li>
          </ul>
        </div>

        <p v-if="message && activeView === 'directory'" class="success" role="status">
          {{ message }}
        </p>
        <p v-if="error && activeView === 'directory'" class="error" role="alert">{{ error }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useUsersStore, type ManagedUser } from '../stores/users'
import { initialsFrom } from '../utils/initials'

const filters = [
  { value: 'all', label: 'All accounts' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'admin', label: 'Admins' },
] as const

type FilterValue = (typeof filters)[number]['value']
type UsersView = 'create' | 'directory'

const usersStore = useUsersStore()
const authStore = useAuthStore()
const { users, loading, deletingId, error, message } = storeToRefs(usersStore)

const activeView = ref<UsersView>('directory')
const roleFilter = ref<FilterValue>('all')
const creating = ref(false)
const currentUsername = computed(() => authStore.username || '')

const form = reactive({
  fullName: '',
  username: '',
  email: '',
  subjectExpertise: '',
  password: '',
})

const counts = computed(() => ({
  all: users.value.length,
  student: users.value.filter((user) => user.role === 'student').length,
  teacher: users.value.filter((user) => user.role === 'teacher').length,
  admin: users.value.filter((user) => user.role === 'admin').length,
}))

const filteredUsers = computed(() => {
  if (roleFilter.value === 'all') return users.value
  return users.value.filter((user) => user.role === roleFilter.value)
})

const activeMeta = computed(() => {
  if (activeView.value === 'create') {
    return {
      kicker: 'Provisioning',
      title: 'New teacher',
      copy: 'Issue a temporary password. Teachers change it on first sign-in. Students self-register.',
    }
  }
  const label = filters.find((item) => item.value === roleFilter.value)?.label || 'Directory'
  return {
    kicker: 'Directory',
    title: label,
    copy: 'Browse accounts, filter by role, and remove users you no longer need.',
  }
})

function openDirectory(value: FilterValue) {
  activeView.value = 'directory'
  roleFilter.value = value
}

function initials(name: string) {
  return initialsFrom(name)
}

async function handleCreateTeacher() {
  creating.value = true
  try {
    await usersStore.createTeacher({
      fullName: form.fullName.trim(),
      username: form.username.trim(),
      email: form.email.trim() || undefined,
      subjectExpertise: form.subjectExpertise.trim() || undefined,
      password: form.password,
    })
    form.fullName = ''
    form.username = ''
    form.email = ''
    form.subjectExpertise = ''
    form.password = ''
    openDirectory('teacher')
  } catch {
    // store error
  } finally {
    creating.value = false
  }
}

async function confirmDelete(user: ManagedUser) {
  if (user.username === currentUsername.value) {
    window.alert('You cannot delete your own account while logged in.')
    return
  }
  const ok = window.confirm(
    `Delete ${user.fullName} (@${user.username})?\n\nTheir classes, requests, and related records will also be removed.`,
  )
  if (!ok) return
  try {
    await usersStore.deleteUser(user.id)
  } catch {
    // store error
  }
}

onMounted(async () => {
  try {
    await usersStore.fetchAll()
  } catch {
    // store error
  }
})
</script>

<style scoped>
.users {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  min-height: 34rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  overflow: hidden;
  background: var(--lh-panel);
  animation: rise 0.45s ease both;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.15rem 0.9rem 1.1rem;
  border-right: 1px solid var(--lh-line);
  background: var(--lh-bg-elevated);
}

.brand-block h2,
.main-head h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-ink);
  margin: 0;
}

.brand-block h2 {
  font-size: 1.35rem;
  margin-top: 0.15rem;
}

.kicker {
  font-family: 'Manrope', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
  margin: 0;
}

.side-copy,
.main-copy,
.hint,
.success,
.error,
.label,
input,
button,
strong,
p,
.role,
.count,
.empty-title,
.nav-group {
  font-family: 'Manrope', sans-serif;
}

.side-copy,
.main-copy {
  margin-top: 0.4rem;
  color: var(--lh-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.side-nav {
  display: grid;
  gap: 0.3rem;
}

.nav-group {
  margin: 0.65rem 0 0.15rem 0.35rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.side-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.7rem;
  background: transparent;
  color: var(--lh-muted);
  padding: 0.65rem 0.7rem;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.side-link:hover {
  background: color-mix(in srgb, var(--lh-ink) 5%, transparent);
  color: var(--lh-ink);
}

.side-link.active {
  background: var(--lh-accent-soft);
  border-color: color-mix(in srgb, var(--lh-accent) 35%, transparent);
  color: var(--lh-accent);
}

.side-label {
  font-size: 0.88rem;
  font-weight: 750;
}

.side-badge {
  min-width: 1.35rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lh-ink) 8%, transparent);
  color: var(--lh-faint);
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.side-link.active .side-badge {
  background: color-mix(in srgb, var(--lh-accent) 18%, transparent);
  color: var(--lh-accent);
}

.main {
  min-width: 0;
  padding: 1.15rem 1.2rem 1.25rem;
  background: color-mix(in srgb, var(--lh-bg-elevated) 35%, transparent);
}

.main-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.main-head h3 {
  font-size: 1.4rem;
  margin-top: 0.15rem;
}

.count {
  color: var(--lh-faint);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.view {
  animation: rise 0.35s ease both;
}

.create-card,
.table-card {
  border: 1px solid var(--lh-line);
  border-radius: 0.95rem;
  background: color-mix(in srgb, var(--lh-bg-elevated) 45%, transparent);
}

.create-card {
  padding: 1.1rem 1.1rem 1.2rem;
  max-width: 42rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 0.85rem;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 750;
  color: var(--lh-muted);
}

.span-2 {
  grid-column: 1 / -1;
}

input {
  width: 100%;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 500;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--lh-line-strong);
  border-radius: 0.55rem;
  background: var(--lh-input);
  color: var(--lh-ink);
}

input::placeholder {
  color: var(--lh-faint);
}

input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lh-accent) 55%, transparent);
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.create {
  margin-top: 1rem;
  border: none;
  border-radius: 0.65rem;
  padding: 0.72rem 1rem;
  font-weight: 800;
  cursor: pointer;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
}

.create:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.table-card {
  padding: 0.35rem 0.85rem 0.55rem;
}

.table-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem 5.5rem;
  gap: 0.75rem;
  padding: 0.7rem 0.35rem 0.55rem;
  border-bottom: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.user-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.user-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem 5.5rem;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 0.35rem;
  border-bottom: 1px solid var(--lh-line);
}

.user-list li:last-child {
  border-bottom: none;
}

.person {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.avatar {
  flex-shrink: 0;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 0.7rem;
  display: grid;
  place-items: center;
  font-size: 0.78rem;
  font-weight: 800;
  background: color-mix(in srgb, var(--lh-ink) 8%, transparent);
  color: var(--lh-ink);
  border: 1px solid var(--lh-line);
}

.avatar[data-role='teacher'] {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  border-color: color-mix(in srgb, var(--lh-accent) 28%, transparent);
}

.avatar[data-role='student'] {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
  border-color: color-mix(in srgb, var(--lh-warm) 28%, transparent);
}

.person-text {
  min-width: 0;
}

.person-text strong {
  display: block;
  font-size: 0.95rem;
  font-weight: 750;
  color: var(--lh-ink);
}

.person-text p {
  margin-top: 0.15rem;
  color: var(--lh-muted);
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.handle {
  color: var(--lh-faint);
}

.dot {
  margin: 0 0.25rem;
  color: var(--lh-faint);
}

.role {
  justify-self: start;
  text-transform: capitalize;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lh-ink) 8%, transparent);
  color: var(--lh-muted);
  border: 1px solid var(--lh-line);
}

.role[data-role='teacher'] {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  border-color: color-mix(in srgb, var(--lh-accent) 28%, transparent);
}

.role[data-role='student'] {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
  border-color: color-mix(in srgb, var(--lh-warm) 28%, transparent);
}

.delete {
  justify-self: end;
  border: 1px solid transparent;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--lh-danger);
  padding: 0.4rem 0.55rem;
  font-size: 0.8rem;
  font-weight: 750;
  cursor: pointer;
}

.delete:hover:not(:disabled) {
  background: var(--lh-danger-soft);
  border-color: color-mix(in srgb, var(--lh-danger) 28%, transparent);
}

.delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  border: 1px solid var(--lh-line);
  border-radius: 0.95rem;
  background: color-mix(in srgb, var(--lh-bg-elevated) 35%, transparent);
}

.empty-title {
  margin: 0;
  color: var(--lh-ink);
  font-weight: 750;
}

.hint {
  margin-top: 0.35rem;
  color: var(--lh-faint);
  font-style: italic;
  font-size: 0.88rem;
}

.success,
.error {
  margin-top: 0.85rem;
  font-size: 0.86rem;
  line-height: 1.4;
}

.success {
  color: var(--lh-accent);
  font-weight: 650;
}

.error {
  color: var(--lh-danger);
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

@media (max-width: 860px) {
  .users {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: none;
    border-bottom: 1px solid var(--lh-line);
  }

  .side-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .nav-group {
    width: 100%;
    margin: 0.35rem 0 0;
  }

  .side-link {
    width: auto;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }
}

@media (max-width: 640px) {
  .table-head {
    display: none;
  }

  .user-list li {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'person role'
      'person delete';
    row-gap: 0.45rem;
  }

  .person {
    grid-area: person;
  }

  .role {
    grid-area: role;
    justify-self: end;
  }

  .delete {
    grid-area: delete;
  }
}
</style>
