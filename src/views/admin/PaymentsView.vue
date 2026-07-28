<script setup lang="ts">
/**
 * Payments (admin). The reference folds billing into Settings (screen 09);
 * the rest of that screen — center hours, slot length, roles — has nothing to
 * persist against, so this stays its own route until those endpoints exist.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaymentReceiptsStore, type PaymentReceipt } from '../../stores/paymentReceipts'
import { useUsersStore } from '../../stores/users'
import { initialsFrom } from '../../utils/initials'
import { formatDate } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

type StatusFilter = 'all' | 'recorded' | 'confirmed' | 'void'

const receiptsStore = usePaymentReceiptsStore()
const usersStore = useUsersStore()

const { receipts, loading, submitting, error, message } = storeToRefs(receiptsStore)
const { users } = storeToRefs(usersStore)

const filter = ref<StatusFilter>('all')
const showForm = ref(false)

const form = ref({
  studentId: '' as number | '',
  amount: '',
  method: 'transfer',
  description: '',
  paidAt: new Date().toISOString().slice(0, 10),
})

const students = computed(() => users.value.filter((user) => user.role === 'student'))

const visible = computed(() =>
  filter.value === 'all'
    ? receipts.value
    : receipts.value.filter((receipt) => receipt.status === filter.value),
)

const totals = computed(() => {
  const confirmed = receipts.value.filter((r) => r.status === 'confirmed')
  const pending = receipts.value.filter((r) => r.status === 'recorded')
  const sum = (list: PaymentReceipt[]) => list.reduce((total, r) => total + (r.amount || 0), 0)
  return {
    confirmed: sum(confirmed),
    pending: sum(pending),
    currency: receipts.value[0]?.currency || 'USD',
  }
})

usePageEyebrow(() => {
  const count = receipts.value.length
  return `${count} receipt${count === 1 ? '' : 's'} on file`
})

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function statusTone(status: string) {
  if (status === 'confirmed') return 'accent'
  if (status === 'void') return 'danger'
  return 'warm'
}

async function submit() {
  if (!form.value.amount) return
  try {
    await receiptsStore.create({
      studentId: form.value.studentId === '' ? undefined : Number(form.value.studentId),
      amount: Number(form.value.amount),
      method: form.value.method,
      description: form.value.description.trim() || undefined,
      paidAt: form.value.paidAt || undefined,
    })
    form.value.amount = ''
    form.value.description = ''
    showForm.value = false
    await receiptsStore.fetchAll()
  } catch {
    // store surfaces the error
  }
}

async function setStatus(receipt: PaymentReceipt, status: 'confirmed' | 'void') {
  try {
    await receiptsStore.updateStatus(receipt.id, status)
  } catch {
    // store surfaces the error
  }
}

onMounted(async () => {
  await Promise.allSettled([receiptsStore.fetchAll(), usersStore.fetchAll('student')])
})
</script>

<template>
  <section class="payments">
    <div class="stat-strip">
      <div class="stat">
        <p class="stat-label">Confirmed</p>
        <p class="stat-value accent">{{ money(totals.confirmed, totals.currency) }}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Awaiting confirmation</p>
        <p class="stat-value warm">{{ money(totals.pending, totals.currency) }}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Receipts</p>
        <p class="stat-value">{{ receipts.length }}</p>
      </div>
    </div>

    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <div class="toolbar">
      <div class="filters">
        <button
          v-for="item in ['all', 'recorded', 'confirmed', 'void'] as StatusFilter[]"
          :key="item"
          type="button"
          class="pill"
          :class="{ active: filter === item }"
          @click="filter = item"
        >
          {{ item === 'all' ? 'All' : item === 'recorded' ? 'Awaiting' : item }}
        </button>
      </div>

      <button type="button" class="btn-primary" @click="showForm = !showForm">
        {{ showForm ? 'Close' : 'Record a payment' }}
      </button>
    </div>

    <form v-if="showForm" class="record" @submit.prevent="submit">
      <div class="field">
        <label for="student">Student</label>
        <select id="student" v-model="form.studentId">
          <option value="">Unassigned</option>
          <option v-for="student in students" :key="student.id" :value="student.id">
            {{ student.fullName }}
          </option>
        </select>
      </div>

      <div class="field">
        <label for="amount">Amount</label>
        <input id="amount" v-model="form.amount" type="number" min="0" step="0.01" required />
      </div>

      <div class="field">
        <label for="method">Method</label>
        <select id="method" v-model="form.method">
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="transfer">Transfer</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div class="field">
        <label for="paidAt">Paid on</label>
        <input id="paidAt" v-model="form.paidAt" type="date" />
      </div>

      <div class="field wide">
        <label for="description">Description</label>
        <input id="description" v-model="form.description" type="text" placeholder="August term" />
      </div>

      <button type="submit" class="btn-primary" :disabled="submitting">
        {{ submitting ? 'Saving…' : 'Save receipt' }}
      </button>
    </form>

    <div class="table">
      <div class="row head">
        <span>Student</span><span>Receipt</span><span>Amount</span><span>Method</span>
        <span>Paid</span><span>Status</span><span class="col-action" />
      </div>

      <p v-if="loading" class="state">Loading receipts…</p>
      <p v-else-if="!visible.length" class="state">
        {{ receipts.length ? 'Nothing matches that filter.' : 'No receipts recorded yet.' }}
      </p>

      <div v-for="receipt in visible" v-else :key="receipt.id" class="row">
        <div class="who">
          <span class="avatar" aria-hidden="true">
            {{ initialsFrom(receipt.student?.fullName || '?') }}
          </span>
          <p class="name">{{ receipt.student?.fullName ?? 'Unassigned' }}</p>
        </div>
        <p class="muted mono">{{ receipt.receiptNumber || '—' }}</p>
        <p class="amount">{{ money(receipt.amount, receipt.currency) }}</p>
        <p class="muted cap">{{ receipt.method }}</p>
        <p class="muted">{{ formatDate(receipt.paidAt) }}</p>
        <p>
          <span class="chip" :class="statusTone(receipt.status)">{{ receipt.status }}</span>
        </p>

        <div class="col-action">
          <button
            v-if="receipt.status === 'recorded'"
            type="button"
            class="btn-mini"
            @click="setStatus(receipt, 'confirmed')"
          >
            Confirm
          </button>
          <button
            v-if="receipt.status !== 'void'"
            type="button"
            class="btn-mini ghost"
            @click="setStatus(receipt, 'void')"
          >
            Void
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.payments {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.stat-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--lh-line);
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
}

.stat {
  padding: 15px 18px;
  background: var(--lh-bg);
}

.stat-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.stat-value {
  margin-top: 10px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
}

.stat-value.accent {
  color: var(--lh-accent);
}

.stat-value.warm {
  color: var(--lh-warm);
}

.banner {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 12.5px;
}

.banner.error {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
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
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: capitalize;
  cursor: pointer;
}

.pill.active {
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  color: var(--lh-ink);
  font-weight: 700;
}

.btn-primary {
  margin-left: auto;
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

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pill:focus-visible,
.btn-primary:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

/* Record form */

.record {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 12px;
  align-items: end;
  padding: 16px 18px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field.wide {
  grid-column: span 4;
}

.field label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.field input,
.field select {
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
}

.field input:focus,
.field select:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.record .btn-primary {
  margin-left: 0;
  height: 34px;
}

/* Table */

.table {
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 0.9fr 0.8fr 1fr 0.9fr auto;
  gap: 14px;
  align-items: center;
  padding: 12px 18px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
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
  display: flex;
  gap: 6px;
  width: 8.5rem;
  justify-content: flex-end;
}

.who {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.avatar {
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-size: 10px;
  font-weight: 800;
}

.name {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--lh-muted);
}

.mono {
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
}

.cap {
  text-transform: capitalize;
}

.amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: capitalize;
}

.chip.accent {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.chip.warm {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.chip.danger {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.btn-mini {
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.btn-mini.ghost {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-faint);
}

.btn-mini.ghost:hover {
  color: var(--lh-danger);
}

.btn-mini:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.state {
  padding: 18px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

@media (max-width: 1100px) {
  .record {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field.wide {
    grid-column: span 2;
  }

  .row {
    grid-template-columns: 1.4fr 1fr 0.9fr auto;
  }

  .row > :nth-child(4),
  .row > :nth-child(5) {
    display: none;
  }
}
</style>
