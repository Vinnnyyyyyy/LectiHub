<template>
  <section class="panel">
    <div class="section-head">
      <h2>Users</h2>
    </div>
    <p class="subtitle">
      Delete student or teacher accounts you no longer need. You cannot delete your own login or the
      last admin.
    </p>

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
import { computed, onMounted, ref } from 'vue'
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
const currentUsername = computed(() => authStore.username || '')

const filteredUsers = computed(() => {
  if (roleFilter.value === 'all') return users.value
  return users.value.filter((user) => user.role === roleFilter.value)
})

function setFilter(value: FilterValue) {
  roleFilter.value = value
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

.section-head h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

.subtitle,
.hint,
.success,
.error,
button,
p,
strong,
.role {
  font-family: 'Manrope', sans-serif;
}

.subtitle {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.9rem;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.9rem;
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
