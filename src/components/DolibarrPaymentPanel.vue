<template>
  <section class="payment-panel">
    <header class="panel-head">
      <div>
        <p class="kicker">Secure checkout</p>
        <h2>Pay with Dolibarr</h2>
      </div>
      <p v-if="config?.currency" class="currency">{{ config.currency }}</p>
    </header>
    <p class="subtitle">
      Complete lesson payments through LectiHub’s Dolibarr billing form. You will be sent to the
      Dolibarr payment page to finish securely.
    </p>

    <p v-if="loadingConfig" class="hint">Loading payment settings…</p>

    <div v-else-if="!config?.enabled" class="empty-state">
      <p class="empty-title">Payments not connected yet</p>
      <p class="hint">
        An administrator needs to set <code>DOLIBARR_ENABLED</code> and
        <code>DOLIBARR_BASE_URL</code> on the API server.
      </p>
    </div>

    <form v-else class="pay-form" @submit.prevent="handlePay">
      <div class="payer">
        <p class="field-label">Payer</p>
        <p class="payer-name">{{ displayName }}</p>
        <p v-if="username" class="payer-meta">@{{ username }}</p>
      </div>

      <label for="pay-amount">
        Amount ({{ config.currency }})
        <input
          id="pay-amount"
          v-model.number="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          :readonly="!config.allowCustomAmount"
        />
      </label>

      <label for="pay-purpose">
        What is this for?
        <input
          id="pay-purpose"
          v-model="purpose"
          type="text"
          maxlength="120"
          placeholder="e.g. Math lesson package · July"
          required
        />
      </label>

      <label for="pay-invoice" class="optional">
        Dolibarr invoice ref <span>(optional)</span>
        <input
          id="pay-invoice"
          v-model="invoiceRef"
          type="text"
          maxlength="64"
          placeholder="Leave blank for an open amount payment"
        />
      </label>

      <p class="note">
        {{
          invoiceRef.trim()
            ? 'You will pay the selected Dolibarr invoice.'
            : 'You will pay the amount above. LectiHub tags the payment so Dolibarr can match it to your account.'
        }}
      </p>

      <button type="submit" class="submit" :disabled="submitting">
        {{ submitting ? 'Opening Dolibarr…' : 'Continue to Dolibarr payment' }}
      </button>

      <p v-if="successMessage" class="success" role="status">{{ successMessage }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import axios from 'axios'
import api from '../api/axios'

defineProps<{
  displayName: string
  username?: string | null
}>()

interface PaymentConfig {
  enabled: boolean
  currency: string
  defaultAmount: number | null
  allowCustomAmount: boolean
  paymentMethod: string | null
  message?: string
}

const config = ref<PaymentConfig | null>(null)
const loadingConfig = ref(true)
const amount = ref<number | null>(null)
const purpose = ref('Lesson payment')
const invoiceRef = ref('')
const submitting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

async function loadConfig() {
  loadingConfig.value = true
  errorMessage.value = ''
  try {
    const res = await api.get<PaymentConfig>('/payments/config')
    config.value = res.data
    amount.value = res.data.defaultAmount ?? 25
  } catch (err) {
    config.value = null
    if (axios.isAxiosError(err)) {
      errorMessage.value = err.response?.data?.message || 'Could not load payment settings'
    } else {
      errorMessage.value = 'Could not load payment settings'
    }
  } finally {
    loadingConfig.value = false
  }
}

async function handlePay() {
  successMessage.value = ''
  errorMessage.value = ''
  submitting.value = true
  try {
    const res = await api.post<{
      paymentUrl: string
      amount: number | null
      currency: string
    }>('/payments/dolibarr/link', {
      amount: amount.value,
      purpose: purpose.value.trim(),
      invoiceRef: invoiceRef.value.trim() || undefined,
    })

    successMessage.value = 'Opening the Dolibarr payment form…'
    window.open(res.data.paymentUrl, '_blank', 'noopener,noreferrer')
  } catch (err) {
    if (axios.isAxiosError(err)) {
      errorMessage.value = err.response?.data?.message || 'Could not start Dolibarr payment'
    } else {
      errorMessage.value = 'Could not start Dolibarr payment'
    }
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<style scoped>
.payment-panel {
  padding: 1.2rem 1.15rem 1.3rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  background:
    radial-gradient(ellipse 60% 45% at 0% 0%, rgba(126, 184, 164, 0.12), transparent 55%),
    var(--lh-panel);
  backdrop-filter: blur(10px);
  animation: rise 0.45s ease both;
  max-width: 36rem;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-end;
}

.kicker,
.subtitle,
.hint,
.field-label,
.payer-name,
.payer-meta,
.note,
.success,
.error,
label,
input,
button,
.empty-title,
.currency,
code {
  font-family: 'Manrope', sans-serif;
}

.kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

h2 {
  margin: 0.15rem 0 0;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 550;
  color: var(--lh-ink);
}

.currency {
  margin: 0;
  color: var(--lh-accent);
  font-size: 0.82rem;
  font-weight: 800;
}

.subtitle {
  margin: 0.45rem 0 0;
  color: var(--lh-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.empty-state {
  margin-top: 1.1rem;
  padding: 1.1rem 0.9rem;
  border-top: 1px solid var(--lh-line);
}

.empty-title {
  margin: 0;
  color: var(--lh-ink);
  font-weight: 750;
}

.hint {
  margin-top: 0.4rem;
  color: var(--lh-faint);
  font-size: 0.88rem;
  font-style: italic;
  line-height: 1.45;
}

code {
  font-style: normal;
  color: var(--lh-accent);
  font-size: 0.82rem;
}

.pay-form {
  margin-top: 1.1rem;
  display: grid;
  gap: 0.85rem;
}

.payer {
  padding: 0.75rem 0.85rem;
  border-radius: 0.8rem;
  border: 1px solid var(--lh-line);
  background: rgba(16, 20, 26, 0.45);
}

.field-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.payer-name {
  margin: 0.25rem 0 0;
  color: var(--lh-ink);
  font-weight: 750;
}

.payer-meta {
  margin: 0.15rem 0 0;
  color: var(--lh-muted);
  font-size: 0.84rem;
}

label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--lh-muted);
}

label.optional span {
  color: var(--lh-faint);
  font-weight: 500;
}

input {
  width: 100%;
  border-radius: 0.7rem;
  border: 1px solid var(--lh-line-strong);
  background: var(--lh-input);
  color: var(--lh-ink);
  padding: 0.7rem 0.8rem;
  font: inherit;
  font-size: 0.92rem;
  color-scheme: dark;
}

input:read-only {
  opacity: 0.85;
}

.note {
  margin: 0;
  color: var(--lh-faint);
  font-size: 0.82rem;
  line-height: 1.45;
}

.submit {
  border: 0;
  border-radius: 0.75rem;
  padding: 0.8rem 1rem;
  font-weight: 750;
  font-size: 0.92rem;
  cursor: pointer;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
  width: fit-content;
}

.submit:disabled {
  opacity: 0.55;
  cursor: wait;
}

.success {
  margin: 0;
  color: var(--lh-accent);
  font-size: 0.88rem;
  font-weight: 650;
}

.error {
  margin: 0;
  color: var(--lh-danger);
  font-size: 0.88rem;
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
</style>
