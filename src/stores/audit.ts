import { defineStore } from 'pinia'
import api from '../api/axios'

export type AuditCategory = 'scheduling' | 'accounts' | 'materials' | 'announcements' | 'settings'

export interface AuditEvent {
  id: number
  category: AuditCategory
  action: string
  description: string
  actorId: number | null
  actorName: string
  entityType: string | null
  entityId: number | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuditFilters {
  category?: AuditCategory | ''
  days?: number
  actor?: string
  search?: string
  limit?: number
}

interface AuditState {
  events: AuditEvent[]
  total: number
  byCategory: Record<string, number>
  loading: boolean
  error: string | null
}

export const useAuditStore = defineStore('audit', {
  state: (): AuditState => ({
    events: [],
    total: 0,
    byCategory: {},
    loading: false,
    error: null,
  }),

  actions: {
    async fetch(filters: AuditFilters = {}) {
      this.loading = true
      this.error = null
      try {
        const params: Record<string, string | number> = {}
        if (filters.category) params.category = filters.category
        if (filters.days) params.days = filters.days
        if (filters.actor) params.actor = filters.actor
        if (filters.search) params.search = filters.search
        if (filters.limit) params.limit = filters.limit

        const res = await api.get<{
          events: AuditEvent[]
          counts: { total: number; byCategory: Record<string, number> }
        }>('/admin/audit', { params })

        this.events = res.data.events || []
        this.total = res.data.counts?.total ?? 0
        this.byCategory = res.data.counts?.byCategory ?? {}
      } catch (err) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        this.error = axiosErr.response?.data?.message || 'Could not read the audit log'
        throw err
      } finally {
        this.loading = false
      }
    },
  },
})
