<template>
  <section class="student-pay">
    <form class="pay-form" @submit.prevent="handleSubmit">
      <p class="kicker">Payment receipt</p>
      <h2>Submit a payment</h2>
      <p class="lede">
        Record a payment you’ve made. LectiHub saves an invoice receipt for the admin Payments
        dashboard.
      </p>

      <div class="grid">
        <label for="stu-amount">
          Amount
          <input
            id="stu-amount"
            v-model.number="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
          />
        </label>
        <label for="stu-method">
          Method
          <select id="stu-method" v-model="method" required>
            <option value="card">Card</option>
            <option value="transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label for="stu-date">
          Paid on
          <input id="stu-date" v-model="paidAt" type="date" required />
        </label>
        <label for="stu-desc" class="span-2">
          Description
          <input
            id="stu-desc"
            v-model="description"
            type="text"
            maxlength="200"
            placeholder="e.g. Lesson package · July"
          />
        </label>
      </div>

      <button type="submit" :disabled="submitting">
        {{ submitting ? 'Submitting…' : 'Submit payment receipt' }}
      </button>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>

    <div class="history">
      <h3>Your receipts</h3>
      <p v-if="loading" class="hint">Loading…</p>
      <p v-else-if="!mine.length" class="hint">No payment receipts yet.</p>
      <ul v-else>
        <li v-for="receipt in mine" :key="receipt.id">
          <div>
            <strong>{{ receipt.receiptNumber }}</strong>
            <p>
              {{ receipt.currency }} {{ receipt.amount.toFixed(2) }} · {{ receipt.method }} ·
              {{ receipt.paidAt }}
            </p>
          </div>
          <span class="status" :class="receipt.status">{{ receipt.status }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaymentReceiptsStore } from '../stores/paymentReceipts'

const store = usePaymentReceiptsStore()
const { mine, loading, submitting, error, message } = storeToRefs(store)

const amount = ref(25)
const method = ref('card')
const paidAt = ref(new Date().toISOString().slice(0, 10))
const description = ref('')

async function handleSubmit() {
  await store.create({
    amount: amount.value,
    method: method.value,
    paidAt: paidAt.value,
    description: description.value.trim() || undefined,
  })
  description.value = ''
  await store.fetchMine()
}

onMounted(() => {
  void store.fetchMine()
})
</script>

<style scoped>
.student-pay,
.kicker,
.lede,
label,
input,
select,
button,
.hint,
.success,
.error,
.history,
p,
h2,
h3,
strong,
span {
  font-family: 'Manrope', sans-serif;
}

.student-pay {
  display: grid;
  gap: 1rem;
  max-width: 40rem;
}

.pay-form,
.history {
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  background: var(--lh-panel);
  padding: 1.15rem 1.15rem 1.25rem;
}

.kicker {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

h2,
h3 {
  margin: 0.2rem 0 0;
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-ink);
}

.lede,
.hint {
  margin: 0.4rem 0 0;
  color: var(--lh-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.grid {
  margin-top: 0.9rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--lh-muted);
}

.span-2 {
  grid-column: 1 / -1;
}

input,
select {
  width: 100%;
  border-radius: 0.65rem;
  border: 1px solid var(--lh-line-strong);
  background: var(--lh-input);
  color: var(--lh-ink);
  padding: 0.65rem 0.75rem;
  font: inherit;
  color-scheme: dark;
}

button {
  margin-top: 0.9rem;
  border: 0;
  border-radius: 0.7rem;
  padding: 0.75rem 1rem;
  font-weight: 750;
  cursor: pointer;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
}

button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.success {
  margin: 0.55rem 0 0;
  color: var(--lh-accent);
}

.error {
  margin: 0.55rem 0 0;
  color: var(--lh-danger);
}

.history ul {
  list-style: none;
  margin: 0.8rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.history li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0.8rem;
  border-radius: 0.8rem;
  border: 1px solid var(--lh-line);
  background: rgba(16, 20, 26, 0.4);
}

.history p {
  margin: 0.2rem 0 0;
  color: var(--lh-muted);
  font-size: 0.84rem;
}

.status {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
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

@media (max-width: 560px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
