import { defineStore } from 'pinia'
import api from '../api/axios'

export interface ScheduleSlot {
  id?: number
  preferredDate: string
  timeSlot: string
}

export interface ScheduleRequest {
  id: number
  studentId: number
  student?: {
    id: number
    username: string
    fullName: string
    email: string
  }
  remarks: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  slots: ScheduleSlot[]
}

interface ScheduleState {
  requests: ScheduleRequest[]
  loading: boolean
  submitting: boolean
  error: string | null
}

export const useScheduleStore = defineStore('schedule', {
  state: (): ScheduleState => ({
    requests: [],
    loading: false,
    submitting: false,
    error: null,
  }),

  actions: {
    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<ScheduleRequest[]>('/schedule-requests/mine')
        this.requests = res.data
      } catch (err) {
        this.error = 'Could not load your schedule requests'
        throw err
      } finally {
        this.loading = false
      }
    },

    async submitRequest(payload: { slots: ScheduleSlot[]; remarks: string }) {
      this.submitting = true
      this.error = null
      try {
        const res = await api.post<ScheduleRequest>('/schedule-requests', payload)
        this.requests = [res.data, ...this.requests]
        return res.data
      } catch (err) {
        this.error = 'Could not submit schedule request'
        throw err
      } finally {
        this.submitting = false
      }
    },
  },
})
