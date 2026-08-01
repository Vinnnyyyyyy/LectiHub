import { defineStore } from 'pinia'
import api from '../api/axios'

export interface PaymentReceipt {
  id: number
  studentId: number
  student: {
    id: number
    username: string
    fullName: string
    email: string
  }
  recordedById?: number | null
  recordedBy?: {
    id: number
    username: string
    fullName: string
  } | null
  amountCents: number
  amount: number
  currency: string
  method: 'cash' | 'card' | 'transfer' | 'other' | string
  status: 'recorded' | 'confirmed' | 'void' | string
  description: string
  paidAt: string
  receiptNumber: string
  notes: string
  createdAt: string
}

interface PaymentReceiptsState {
  receipts: PaymentReceipt[]
  mine: PaymentReceipt[]
  loading: boolean
  submitting: boolean
  error: string | null
  message: string | null
}

export const usePaymentReceiptsStore = defineStore('paymentReceipts', {
  state: (): PaymentReceiptsState => ({
    receipts: [],
    mine: [],
    loading: false,
    submitting: false,
    error: null,
    message: null,
  }),

  actions: {
    async fetchAll(status?: string) {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ receipts: PaymentReceipt[] }>('/payment-receipts', {
          params: status ? { status } : undefined,
        })
        this.receipts = res.data.receipts || []
      } catch {
        this.error = 'Could not load payment receipts'
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },

    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ receipts: PaymentReceipt[] }>('/payment-receipts/mine')
        this.mine = res.data.receipts || []
      } catch {
        this.error = 'Could not load your payment receipts'
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },

    async create(payload: {
      studentId?: number
      amount: number
      currency?: string
      method: string
      description?: string
      paidAt?: string
      notes?: string
    }) {
      this.submitting = true
      this.error = null
      this.message = null
      try {
        const res = await api.post<{ message: string; receipt: PaymentReceipt }>(
          '/payment-receipts',
          payload,
        )
        this.message = res.data.message
        return res.data.receipt
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        this.error = axiosErr.response?.data?.message || 'Could not save payment receipt'
        throw err
      } finally {
        this.submitting = false
      }
    },

    async updateStatus(id: number, status: 'recorded' | 'confirmed' | 'void') {
      this.error = null
      this.message = null
      try {
        const res = await api.patch<{ message: string; receipt: PaymentReceipt }>(
          `/payment-receipts/${id}`,
          { status },
        )
        this.message = res.data.message
        const idx = this.receipts.findIndex((item) => item.id === id)
        if (idx >= 0) this.receipts[idx] = res.data.receipt
        return res.data.receipt
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        this.error = axiosErr.response?.data?.message || 'Could not update receipt'
        throw err
      }
    },
  },
})
