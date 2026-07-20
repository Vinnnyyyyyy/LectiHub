import { defineStore } from 'pinia'
import api from '../api/axios'
import type { ScheduleRequest, ScheduleSlot } from './schedule'
import type { ConfirmedSchedule } from './classes'

export interface TeacherSummary {
  id: number
  username: string
  fullName: string
  email: string
  subjectExpertise?: string
  workload?: number
}

export interface UnavailableTeacher extends TeacherSummary {
  conflict: {
    classId: number
    title: string
    classDate: string
    timeSlot: string
  }
}

export interface SlotAvailability {
  id: number
  preferredDate: string
  timeSlot: string
  availableTeachers: TeacherSummary[]
  unavailableTeachers: UnavailableTeacher[]
}

export interface TeacherCandidate extends TeacherSummary {
  subjectExpertise: string
  workload: number
  availableSlotCount: number
  fullyAvailable: boolean
  preferenceMatch: boolean
  assignable: boolean
  freeSlots: ScheduleSlot[]
  matchReasons: string[]
  suitabilityScore: number
}

export interface ScheduleRequestReview {
  request: ScheduleRequest
  confirmedSchedule: ConfirmedSchedule | null
  slotAvailability: SlotAvailability[]
  fullyAvailableTeachers: TeacherSummary[]
  teacherCount: number
  teacherCandidates: TeacherCandidate[]
  preferredSubjects: string[]
}

export interface AdminNotification {
  id: number
  type: string
  title: string
  message: string
  relatedRequestId: number | null
  isRead: boolean
  createdAt: string
}

interface AdminScheduleState {
  requests: ScheduleRequest[]
  selected: ScheduleRequestReview | null
  notifications: AdminNotification[]
  unreadCount: number
  loadingRequests: boolean
  loadingReview: boolean
  loadingNotifications: boolean
  assigning: boolean
  error: string | null
}

export const useAdminScheduleStore = defineStore('adminSchedule', {
  state: (): AdminScheduleState => ({
    requests: [],
    selected: null,
    notifications: [],
    unreadCount: 0,
    loadingRequests: false,
    loadingReview: false,
    loadingNotifications: false,
    assigning: false,
    error: null,
  }),

  actions: {
    async fetchPendingRequests() {
      this.loadingRequests = true
      this.error = null
      try {
        const res = await api.get<ScheduleRequest[]>('/schedule-requests', {
          params: { status: 'pending' },
        })
        this.requests = res.data
      } catch (err) {
        this.error = 'Could not load scheduling requests'
        throw err
      } finally {
        this.loadingRequests = false
      }
    },

    async fetchRequestReview(id: number) {
      this.loadingReview = true
      this.error = null
      try {
        const res = await api.get<ScheduleRequestReview>(`/schedule-requests/${id}`)
        this.selected = res.data
        return res.data
      } catch (err) {
        this.error = 'Could not load request details'
        throw err
      } finally {
        this.loadingReview = false
      }
    },

    async assignTeacher(requestId: number, teacherId: number, slotId?: number) {
      this.assigning = true
      this.error = null
      try {
        const res = await api.post<{
          message: string
          request: ScheduleRequest
          confirmedSchedule: ConfirmedSchedule
          calendarSync?: unknown
          emails?: {
            enabled: boolean
            mode?: string
            sent: Array<{
              recipient: string
              email?: string
              sent: boolean
              reason?: string
            }>
          }
        }>(`/schedule-requests/${requestId}/assign`, { teacherId, slotId })
        this.requests = this.requests.filter((item) => item.id !== requestId)
        await this.fetchRequestReview(requestId)
        return res.data
      } catch (err) {
        this.error = 'Could not assign teacher'
        throw err
      } finally {
        this.assigning = false
      }
    },

    async fetchNotifications() {
      this.loadingNotifications = true
      try {
        const res = await api.get<{
          unreadCount: number
          notifications: AdminNotification[]
        }>('/notifications')
        this.unreadCount = res.data.unreadCount
        this.notifications = res.data.notifications
      } finally {
        this.loadingNotifications = false
      }
    },

    async markNotificationRead(id: number) {
      await api.patch(`/notifications/${id}/read`)
      this.notifications = this.notifications.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      )
      this.unreadCount = this.notifications.filter((item) => !item.isRead).length
    },

    async markAllNotificationsRead() {
      await api.patch('/notifications/read-all')
      this.notifications = this.notifications.map((item) => ({ ...item, isRead: true }))
      this.unreadCount = 0
    },

    clearSelected() {
      this.selected = null
    },
  },
})
