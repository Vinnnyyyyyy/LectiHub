<script setup lang="ts">
/**
 * Payments (student). Submit a receipt for the center to confirm, and keep
 * the history. Not one of the 20 boards — kept as a route so the existing
 * flow survives the redesign, in the same visual language.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaymentReceiptsStore } from '../../stores/paymentReceipts'
import { formatDate } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

const receiptsStore = usePaymentReceiptsStore()
const { mine, loading, submitting, error, message } = storeToRefs(receiptsStore)

const showForm = ref(false)
const form = ref({
  amount: '',
  method: 'transfer',
  description: '',
  paidAt: new Date().toISOString().slice(0, 10),
})

const confirmedTotal = computed(() =>
  mine.value.filter((r) => r.status === 'confirmed').reduce((sum, r) => sum + (r.amount || 0), 0),
)

const awaiting = computed(() => mine.value.filter((r) => r.status === 'recorded').length)

const currency = computed(() => mine.value[0]?.currency || 'USD')

usePageEyebrow(() =>
  awaiting.value ? `${awaiting.value} awaiting confirmation` : 'All receipts confirmed',
)

function money(amount: number, code: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(2)}`
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
      amount: Number(form.value.amount),
      method: form.value.method,
      description: form.value.description.trim() || undefined,
      paidAt: form.value.paidAt || undefined,
    })
    form.value.amount = ''
    form.value.description = ''
    showForm.value = false
    await receiptsStore.fetchMine()
  } catch {
    // store surfaces the error
  }
}

onMounted(() => {
  if (!mine.value.length) void receiptsStore.fetchMine()
})
</script>

<template>
  <section class="payments">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <div class="summary">
      <div class="sum">
        <p class="sum-label">Confirmed to date</p>
        <p class="sum-value">{{ money(confirmedTotal, currency) }}</p>
      </div>
      <button type="button" class="btn-primary" @click="showForm = !showForm">
        {{ showForm ? 'Cancel' : 'Submit a receipt' }}
      </button>
    </div>

    <form v-if="showForm" class="record" @submit.prevent="submit">
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
        <label for="description">What it covers</label>
        <input
          id="description"
          v-model="form.description"
          type="text"
          placeholder="August term fees"
        />
      </div>
      <button type="submit" class="btn-primary" :disabled="submitting">
        {{ submitting ? 'Sending…' : 'Submit for review' }}
      </button>
    </form>

    <div class="list">
      <p v-if="loading" class="empty">Loading your receipts…</p>
      <p v-else-if="!mine.length" class="empty">
        No receipts yet. Submit one once you've paid and the center will confirm it.
      </p>

      <article v-for="receipt in mine" v-else :key="receipt.id" class="card">
        <div class="card-head">
          <p class="amount">{{ money(receipt.amount, receipt.currency) }}</p>
          <span class="chip" :class="statusTone(receipt.status)">{{ receipt.status }}</span>
        </div>
        <p class="card-sub">
          {{ formatDate(receipt.paidAt) }} · <span class="cap">{{ receipt.method }}</span>
          <template v-if="receipt.receiptNumber"> · {{ receipt.receiptNumber }}</template>
        </p>
        <p v-if="receipt.description" class="card-body">{{ receipt.description }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.payments {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  max-width: 44rem;
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

.summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.sum-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.sum-value {
  margin-top: 8px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 30px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--lh-accent);
}

.btn-primary {
  margin-left: auto;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.btn-primary:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent-hover);
}

.record {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  grid-column: span 2;
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
  height: 36px;
  padding: 0 11px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 13px;
}

.field input:focus,
.field select:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.record .btn-primary {
  margin-left: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.card {
  padding: 14px 16px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.amount {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.chip {
  margin-left: auto;
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

.card-sub {
  margin-top: 5px;
  font-size: 12px;
  color: var(--lh-faint);
}

.cap {
  text-transform: capitalize;
}

.card-body {
  margin-top: 9px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--lh-muted);
}

.empty {
  padding: 18px 0;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

@media (max-width: 760px) {
  .record {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field.wide {
    grid-column: span 2;
  }
}
</style>
