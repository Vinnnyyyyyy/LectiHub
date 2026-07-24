<template>
  <div class="users-workspace">
    <aside class="create-pane">
      <p class="pane-kicker">Provisioning</p>
      <h3>New teacher</h3>
      <p class="pane-copy">
        Issue a temporary password. Teachers sign in and change it on first use. Students register on
        their own.
      </p>

      <form class="create-form" @submit.prevent="handleCreateTeacher">
        <label for="teacher-full-name">Full name</label>
        <input id="teacher-full-name" v-model="form.fullName" type="text" required maxlength="120" />

        <label for="teacher-username">Username</label>
        <input
          id="teacher-username"
          v-model="form.username"
          type="text"
          required
          maxlength="60"
          autocomplete="off"
        />

        <label for="teacher-email">Email</label>
        <input id="teacher-email" v-model="form.email" type="email" maxlength="120" />

        <label for="teacher-subject">Subject expertise</label>
        <input
          id="teacher-subject"
          v-model="form.subjectExpertise"
          type="text"
          maxlength="120"
          placeholder="Math, Writing, Science…"
        />

        <label for="teacher-password">Temporary password</label>
        <input
          id="teacher-password"
          v-model="form.password"
          type="text"
          required
          minlength="6"
          maxlength="80"
          autocomplete="new-password"
        />

        <button type="submit" class="create" :disabled="creating">
          {{ creating ? 'Creating…' : 'Create teacher' }}
        </button>
      </form>

      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </aside>

    <section class="directory-pane" aria-label="User directory">
      <div class="directory-head">
        <div>
          <p class="pane-kicker">Directory</p>
          <h3>All accounts</h3>
        </div>
        <p class="count">{{ filteredUsers.length }} shown</p>
      </div>

      <div class="filters" role="group" aria-label="Filter by role">
        <button
          v-for="option in filters"
          :key="option.value"
          type="button"
          class="filter"
          :class="{ active: roleFilter === option.value }"
          @click="setFilter(option.value)"
        >
          {{ option.label }}
          <span>{{ counts[option.value] }}</span>
        </button>
      </div>

      <p v-if="loading" class="hint">Loading directory…</p>
      <p v-else-if="!filteredUsers.length" class="hint">No accounts in this filter.</p>

      <div v-else class="table-wrap">
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
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useUsersStore, type ManagedUser } from '../stores/users'

const filters = [
  { value: 'all', label: 'All' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'admin', label: 'Admins' },
] as const

type FilterValue = (typeof filters)[number]['value']

const usersStore = useUsersStore()
const authStore = useAuthStore()
const { users, loading, deletingId, error, message } = storeToRefs(usersStore)

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

function setFilter(value: FilterValue) {
  roleFilter.value = value
}

function initials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
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
    roleFilter.value = 'teacher'
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
.users-workspace {
  display: grid;
  grid-template-columns: minmax(16rem, 19.5rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
  animation: rise 0.45s ease both;
}

.create-pane,
.directory-pane {
  border: 1px solid var(--lh-line);
  border-radius: 1.05rem;
  background:
    linear-gradient(165deg, rgba(36, 44, 54, 0.55), transparent 42%),
    var(--lh-panel);
  backdrop-filter: blur(10px);
}

.create-pane {
  padding: 1.15rem 1.1rem 1.2rem;
}

.directory-pane {
  padding: 1.15rem 1.15rem 1.25rem;
  min-width: 0;
}

.pane-kicker {
  font-family: 'Manrope', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
  margin: 0;
}

.create-pane h3,
.directory-pane h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 550;
  color: var(--lh-ink);
  margin: 0.2rem 0 0;
}

.pane-copy,
.count,
.hint,
.success,
.error,
label,
input,
button,
strong,
p,
.role {
  font-family: 'Manrope', sans-serif;
}

.pane-copy {
  margin-top: 0.45rem;
  color: var(--lh-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.create-form {
  display: grid;
  gap: 0.35rem;
  margin-top: 1rem;
}

label {
  margin-top: 0.45rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--lh-muted);
}

input {
  width: 100%;
  font: inherit;
  font-size: 0.92rem;
  padding: 0.62rem 0.7rem;
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
  border-color: rgba(126, 184, 164, 0.55);
  box-shadow: 0 0 0 3px rgba(126, 184, 164, 0.12);
}

.create {
  margin-top: 0.85rem;
  border: none;
  border-radius: 0.65rem;
  padding: 0.72rem 0.95rem;
  font-weight: 800;
  cursor: pointer;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
  transition: transform 0.15s ease, filter 0.15s ease;
}

.create:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

.create:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.directory-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 0.75rem;
}

.count {
  color: var(--lh-faint);
  font-size: 0.82rem;
  font-weight: 700;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.95rem;
}

.filter {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--lh-line);
  border-radius: 999px;
  background: transparent;
  color: var(--lh-muted);
  padding: 0.38rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.filter span {
  min-width: 1.1rem;
  text-align: center;
  color: var(--lh-faint);
  font-variant-numeric: tabular-nums;
}

.filter.active {
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.4);
  color: var(--lh-accent);
}

.filter.active span {
  color: var(--lh-accent);
}

.hint {
  margin-top: 1rem;
  color: var(--lh-faint);
  font-style: italic;
  font-size: 0.9rem;
}

.table-wrap {
  margin-top: 0.95rem;
}

.table-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem 5.5rem;
  gap: 0.75rem;
  padding: 0 0.35rem 0.45rem;
  border-bottom: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-family: 'Manrope', sans-serif;
  font-size: 0.72rem;
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
  animation: rise 0.4s ease both;
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
  font-family: 'Manrope', sans-serif;
  font-size: 0.78rem;
  font-weight: 800;
  background: rgba(231, 236, 239, 0.08);
  color: var(--lh-ink);
  border: 1px solid var(--lh-line);
}

.avatar[data-role='teacher'] {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  border-color: rgba(126, 184, 164, 0.28);
}

.avatar[data-role='student'] {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
  border-color: rgba(196, 165, 116, 0.28);
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
  letter-spacing: 0.02em;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: rgba(231, 236, 239, 0.08);
  color: var(--lh-muted);
  border: 1px solid var(--lh-line);
}

.role[data-role='teacher'] {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  border-color: rgba(126, 184, 164, 0.28);
}

.role[data-role='student'] {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
  border-color: rgba(196, 165, 116, 0.28);
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
  transition: background 0.15s ease, border-color 0.15s ease;
}

.delete:hover:not(:disabled) {
  background: var(--lh-danger-soft);
  border-color: rgba(224, 138, 122, 0.28);
}

.delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

@media (max-width: 900px) {
  .users-workspace {
    grid-template-columns: 1fr;
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
