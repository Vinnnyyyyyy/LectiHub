<template>
  <section class="payments">
    <aside class="sidebar" aria-label="Payment receipts">
      <div class="brand-block">
        <p class="kicker">Billing</p>
        <h2>Payments</h2>
        <p class="side-copy">Record student payments and review invoice receipts.</p>
      </div>

      <nav class="side-nav" role="tablist" aria-orientation="vertical">
        <button
          type="button"
          role="tab"
          class="side-link"
          :class="{ active: view === 'record' }"
          :aria-selected="view === 'record'"
          @click="view = 'record'"
        >
          <span class="side-label">Record payment</span>
        </button>

        <p class="nav-group">Receipts</p>
        <button
          v-for="option in filters"
          :key="option.value"
          type="button"
          role="tab"
          class="side-link"
          :class="{ active: view === 'list' && statusFilter === option.value }"
          :aria-selected="view === 'list' && statusFilter === option.value"
          @click="openList(option.value)"
        >
          <span class="side-label">{{ option.label }}</span>
          <span class="side-badge">{{ counts[option.value] }}</span>
        </button>
      </nav>
    </aside>

    <div class="main">
      <header class="main-head">
        <div>
          <p class="kicker">{{ view === 'record' ? 'New receipt' : 'Invoice receipts' }}</p>
          <h3>{{ view === 'record' ? 'Record student payment' : listTitle }}</h3>
          <p class="main-copy">
            {{
              view === 'record'
                ? 'Save a payment receipt for a student. Confirmed receipts appear in this Payments list.'
                : 'Open a receipt to confirm or void it.'
            }}
          </p>
        </div>
        <p v-if="view === 'list'" class="count">{{ filtered.length }} shown</p>
      </header>

      <div v-show="view === 'record'" class="view">
        <form class="create-card" @submit.prevent="handleRecord">
          <div class="form-grid">
            <label for="pay-student" class="span-2">
              Student
              <select id="pay-student" v-model.number="form.studentId" required>
                <option disabled :value="0">Select a student</option>
                <option v-for="student in students" :key="student.id" :value="student.id">
                  {{ student.fullName }} (@{{ student.username }})
                </option>
              </select>
            </label>
            <label for="pay-amount">
              Amount
              <input
                id="pay-amount"
                v-model.number="form.amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label for="pay-currency">
              Currency
              <input id="pay-currency" v-model="form.currency" type="text" maxlength="8" required />
            </label>
            <label for="pay-method">
              Method
              <select id="pay-method" v-model="form.method" required>
                <option value="card">Card</option>
                <option value="transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label for="pay-date">
              Paid on
              <input id="pay-date" v-model="form.paidAt" type="date" required />
            </label>
            <label for="pay-desc" class="span-2">
              Description
              <input
                id="pay-desc"
                v-model="form.description"
                type="text"
                maxlength="200"
                placeholder="e.g. July lesson package"
              />
            </label>
            <label for="pay-notes" class="span-2">
              Notes
              <textarea id="pay-notes" v-model="form.notes" rows="3" maxlength="500" />
            </label>
          </div>
          <button type="submit" class="create" :disabled="submitting || !form.studentId">
            {{ submitting ? 'Saving…' : 'Save payment receipt' }}
          </button>
          <p v-if="message" class="success" role="status">{{ message }}</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
        </form>
      </div>

      <div v-show="view === 'list'" class="view">
        <p v-if="loading" class="hint">Loading receipts…</p>
        <p v-else-if="!filtered.length" class="hint">No payment receipts in this filter.</p>
        <div v-else class="split">
          <ul class="receipt-list">
            <li v-for="receipt in filtered" :key="receipt.id">
              <button
                type="button"
                class="receipt-btn"
                :class="{ active: selectedId === receipt.id }"
                @click="selectedId = receipt.id"
              >
                <div class="row-top">
                  <strong>{{ receipt.student.fullName }}</strong>
                  <span class="status" :class="receipt.status">{{ receipt.status }}</span>
                </div>
                <p>
                  {{ receipt.currency }} {{ receipt.amount.toFixed(2) }} · {{ receipt.method }} ·
                  {{ receipt.receiptNumber }}
                </p>
                <time>{{ receipt.paidAt }}</time>
              </button>
            </li>
          </ul>

          <div v-if="selected" class="detail">
            <p class="kicker">Receipt {{ selected.receiptNumber }}</p>
            <h4>{{ selected.student.fullName }}</h4>
            <p class="meta">
              @{{ selected.student.username }}
              <span v-if="selected.student.email"> · {{ selected.student.email }}</span>
            </p>
            <dl class="facts">
              <div>
                <dt>Amount</dt>
                <dd>{{ selected.currency }} {{ selected.amount.toFixed(2) }}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{{ selected.method }}</dd>
              </div>
              <div>
                <dt>Paid on</dt>
                <dd>{{ selected.paidAt }}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{{ selected.status }}</dd>
              </div>
              <div v-if="selected.description" class="span-2">
                <dt>Description</dt>
                <dd>{{ selected.description }}</dd>
              </div>
              <div v-if="selected.notes" class="span-2">
                <dt>Notes</dt>
                <dd>{{ selected.notes }}</dd>
              </div>
            </dl>

            <div class="actions">
              <button
                v-if="selected.status !== 'confirmed'"
                type="button"
                class="action confirm"
                @click="setStatus(selected.id, 'confirmed')"
              >
                Confirm
              </button>
              <button
                v-if="selected.status !== 'void'"
                type="button"
                class="action void"
                @click="setStatus(selected.id, 'void')"
              >
                Void
              </button>
            </div>
          </div>
          <div v-else class="empty-detail">
            <p class="empty-title">No receipt selected</p>
            <p class="hint">Choose a receipt from the list to review it.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaymentReceiptsStore } from '../stores/paymentReceipts'
import { useUsersStore } from '../stores/users'

const paymentStore = usePaymentReceiptsStore()
const usersStore = useUsersStore()
const { receipts, loading, submitting, error, message } = storeToRefs(paymentStore)

const view = ref<'record' | 'list'>('list')
const statusFilter = ref<'all' | 'recorded' | 'confirmed' | 'void'>('all')
const selectedId = ref<number | null>(null)

const filters = [
  { value: 'all' as const, label: 'All' },
  { value: 'recorded' as const, label: 'Recorded' },
  { value: 'confirmed' as const, label: 'Confirmed' },
  { value: 'void' as const, label: 'Void' },
]

const form = reactive({
  studentId: 0,
  amount: 25,
  currency: 'USD',
  method: 'card',
  paidAt: new Date().toISOString().slice(0, 10),
  description: '',
  notes: '',
})

const students = computed(() =>
  usersStore.users.filter((user) => user.role === 'student').sort((a, b) => a.fullName.localeCompare(b.fullName)),
)

const counts = computed(() => ({
  all: receipts.value.length,
  recorded: receipts.value.filter((item) => item.status === 'recorded').length,
  confirmed: receipts.value.filter((item) => item.status === 'confirmed').length,
  void: receipts.value.filter((item) => item.status === 'void').length,
}))

const filtered = computed(() => {
  if (statusFilter.value === 'all') return receipts.value
  return receipts.value.filter((item) => item.status === statusFilter.value)
})

const selected = computed(
  () => filtered.value.find((item) => item.id === selectedId.value) || null,
)

const listTitle = computed(() => {
  const match = filters.find((item) => item.value === statusFilter.value)
  return match ? match.label : 'Receipts'
})

function openList(value: typeof statusFilter.value) {
  view.value = 'list'
  statusFilter.value = value
  if (selected.value && statusFilter.value !== 'all' && selected.value.status !== statusFilter.value) {
    selectedId.value = null
  }
}

async function refresh() {
  await paymentStore.fetchAll()
  if (!selectedId.value && filtered.value.length) {
    selectedId.value = filtered.value[0].id
  }
}

async function handleRecord() {
  await paymentStore.create({
    studentId: form.studentId,
    amount: form.amount,
    currency: form.currency,
    method: form.method,
    paidAt: form.paidAt,
    description: form.description.trim() || undefined,
    notes: form.notes.trim() || undefined,
  })
  form.description = ''
  form.notes = ''
  await refresh()
  view.value = 'list'
  statusFilter.value = 'all'
}

async function setStatus(id: number, status: 'recorded' | 'confirmed' | 'void') {
  await paymentStore.updateStatus(id, status)
  await refresh()
  selectedId.value = id
}

onMounted(async () => {
  await Promise.all([usersStore.fetchAll('student'), refresh()])
})
</script>

<style scoped>
.payments,
.kicker,
.side-copy,
.side-label,
.side-badge,
.main-copy,
.count,
label,
input,
select,
textarea,
button,
.hint,
.success,
.error,
.meta,
.facts,
.empty-title,
time,
p,
h2,
h3,
h4 {
  font-family: 'Manrope', sans-serif;
}

.payments {
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  overflow: hidden;
  background: var(--lh-panel);
  min-height: 28rem;
}

.sidebar {
  padding: 1.15rem 1rem 1.25rem;
  border-right: 1px solid var(--lh-line);
  background: rgba(12, 16, 20, 0.45);
}

.brand-block h2,
.main-head h3,
.detail h4 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-ink);
  margin: 0.15rem 0 0;
}

.kicker {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.side-copy,
.main-copy,
.hint,
.meta {
  margin: 0.4rem 0 0;
  color: var(--lh-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.side-nav {
  margin-top: 1.1rem;
  display: grid;
  gap: 0.35rem;
}

.nav-group {
  margin: 0.75rem 0 0.2rem;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.side-link {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.7rem;
  padding: 0.65rem 0.7rem;
  background: transparent;
  color: var(--lh-muted);
  cursor: pointer;
  text-align: left;
}

.side-link.active {
  border-color: rgba(126, 184, 164, 0.35);
  background: var(--lh-accent-soft);
  color: var(--lh-ink);
}

.side-label {
  font-size: 0.9rem;
  font-weight: 700;
}

.side-badge {
  min-width: 1.35rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: rgba(231, 236, 239, 0.08);
  color: var(--lh-faint);
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
}

.main {
  min-width: 0;
  padding: 1.15rem 1.2rem 1.25rem;
}

.main-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.count {
  color: var(--lh-faint);
  font-size: 0.8rem;
  font-weight: 700;
}

.create-card {
  border: 1px solid var(--lh-line);
  border-radius: 0.95rem;
  background: rgba(16, 20, 26, 0.45);
  padding: 1.1rem;
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

input,
select,
textarea {
  width: 100%;
  font: inherit;
  font-size: 0.92rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--lh-line-strong);
  border-radius: 0.55rem;
  background: var(--lh-input);
  color: var(--lh-ink);
  color-scheme: dark;
}

.create,
.action {
  border: none;
  border-radius: 0.65rem;
  padding: 0.72rem 1rem;
  font-weight: 800;
  cursor: pointer;
}

.create {
  margin-top: 1rem;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
}

.create:disabled {
  opacity: 0.55;
  cursor: wait;
}

.split {
  display: grid;
  grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
  gap: 0.9rem;
}

.receipt-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
  max-height: 28rem;
  overflow: auto;
}

.receipt-btn {
  width: 100%;
  text-align: left;
  border: 1px solid var(--lh-line);
  border-radius: 0.8rem;
  padding: 0.75rem 0.8rem;
  background: rgba(16, 20, 26, 0.45);
  color: var(--lh-ink);
  cursor: pointer;
}

.receipt-btn.active {
  border-color: rgba(126, 184, 164, 0.45);
  background: var(--lh-accent-soft);
}

.row-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.status {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.4rem;
  border-radius: 0.35rem;
}

.status.recorded {
  color: var(--lh-warm);
  background: var(--lh-warm-soft);
}

.status.confirmed {
  color: var(--lh-accent);
  background: var(--lh-accent-soft);
}

.status.void {
  color: var(--lh-danger);
  background: var(--lh-danger-soft);
}

.receipt-btn p,
.receipt-btn time {
  margin: 0.25rem 0 0;
  color: var(--lh-muted);
  font-size: 0.82rem;
}

.detail,
.empty-detail {
  border: 1px solid var(--lh-line);
  border-radius: 0.95rem;
  padding: 1rem;
  background: rgba(16, 20, 26, 0.45);
}

.facts {
  margin: 0.9rem 0 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
}

.facts dt {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.facts dd {
  margin: 0.2rem 0 0;
  color: var(--lh-ink);
  font-weight: 650;
}

.actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.55rem;
}

.action.confirm {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  border: 1px solid rgba(126, 184, 164, 0.35);
}

.action.void {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
  border: 1px solid rgba(224, 138, 122, 0.35);
}

.success {
  margin: 0.7rem 0 0;
  color: var(--lh-accent);
  font-size: 0.88rem;
}

.error {
  margin: 0.7rem 0 0;
  color: var(--lh-danger);
  font-size: 0.88rem;
}

.empty-title {
  margin: 0;
  font-weight: 750;
  color: var(--lh-ink);
}

@media (max-width: 900px) {
  .payments,
  .split,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--lh-line);
  }
}
</style>
