<template>
  <section class="panel">
    <div class="section-head">
      <h2>Users</h2>
    </div>
    <p class="subtitle">
      Admins can create <strong>teacher</strong> accounts only. Students register themselves. You can
      delete accounts you no longer need (not your own login or the last admin).
    </p>

    <form class="create-form" @submit.prevent="handleCreateTeacher">
      <h3>Create teacher</h3>
      <div class="form-grid">
        <label>
          Full name
          <input v-model="form.fullName" type="text" required maxlength="120" />
        </label>
        <label>
          Username
          <input v-model="form.username" type="text" required maxlength="60" autocomplete="off" />
        </label>
        <label>
          Email
          <input v-model="form.email" type="email" maxlength="120" />
        </label>
        <label>
          Subject expertise
          <input
            v-model="form.subjectExpertise"
            type="text"
            maxlength="120"
            placeholder="Math, Science..."
          />
        </label>
        <label>
          Temporary password
          <input v-model="form.password" type="text" required minlength="6" maxlength="80" />
        </label>
      </div>
      <button type="submit" class="create" :disabled="creating">
        {{ creating ? 'Creating...' : 'Create teacher account' }}
      </button>
    </form>

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
      </button>
    </div>

    <p v-if="loading" class="hint">Loading users...</p>
    <p v-else-if="!filteredUsers.length" class="hint">No users in this filter.</p>
    <ul v-else class="user-list">
      <li v-for="user in filteredUsers" :key="user.id">
        <div>
          <strong>{{ user.fullName }}</strong>
          <p>@{{ user.username }} · {{ user.email || 'no email' }}</p>
        </div>
        <div class="actions">
          <span class="role" :data-role="user.role">{{ user.role }}</span>
          <button
            type="button"
            class="delete"
            :disabled="deletingId === user.id || user.username === currentUsername"
            @click="confirmDelete(user)"
          >
            {{ deletingId === user.id ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </li>
    </ul>

    <p v-if="message" class="success" role="status">{{ message }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
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

const filteredUsers = computed(() => {
  if (roleFilter.value === 'all') return users.value
  return users.value.filter((user) => user.role === roleFilter.value)
})

function setFilter(value: FilterValue) {
  roleFilter.value = value
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
    // error on store
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
.panel {
  padding: 1.2rem 1.15rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
}

.section-head h2,
.create-form h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-accent);
}

.section-head h2 {
  font-size: 1.2rem;
}

.create-form h3 {
  font-size: 1.05rem;
  margin-bottom: 0.65rem;
}

.subtitle,
.hint,
.success,
.error,
button,
p,
strong,
.role,
label,
input {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.9rem;
}

.create-form {
  margin-top: 1rem;
  padding: 0.95rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.85rem;
  background: rgba(20, 25, 31, 0.55);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.65rem;
}

label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--lh-muted);
}

input {
  font: inherit;
  font-size: 0.92rem;
  font-weight: 500;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--lh-line-strong);
  border-radius: 0.55rem;
  background: var(--lh-input);
  color: var(--lh-ink);
}

input:focus {
  outline: none;
  border-color: rgba(126, 184, 164, 0.55);
}

.create {
  margin-top: 0.75rem;
  border: none;
  border-radius: 0.65rem;
  padding: 0.65rem 0.95rem;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
}

.create:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 1.1rem;
}

.filter,
.delete {
  border: 1px solid var(--lh-line);
  border-radius: 0.55rem;
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
  font-weight: 700;
}

.filter {
  padding: 0.4rem 0.7rem;
  font-size: 0.82rem;
}

.filter.active {
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.45);
  color: var(--lh-accent);
}

.hint {
  margin-top: 0.85rem;
  color: var(--lh-faint);
  font-style: italic;
}

.user-list {
  list-style: none;
  display: grid;
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.user-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0.8rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.62);
}

.user-list p {
  margin-top: 0.2rem;
  color: var(--lh-muted);
  font-size: 0.85rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.role {
  text-transform: capitalize;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.2rem 0.45rem;
  border-radius: 0.4rem;
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.role[data-role='teacher'] {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.role[data-role='admin'] {
  background: rgba(231, 236, 239, 0.12);
  color: var(--lh-ink);
}

.delete {
  padding: 0.4rem 0.65rem;
  font-size: 0.8rem;
  background: var(--lh-danger-soft);
  border-color: rgba(224, 138, 122, 0.35);
  color: var(--lh-danger);
}

.delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.success {
  margin-top: 0.7rem;
  color: var(--lh-accent);
  font-weight: 600;
}

.error {
  margin-top: 0.7rem;
  color: var(--lh-danger);
}

@media (max-width: 640px) {
  .user-list li {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
