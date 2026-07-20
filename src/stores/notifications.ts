import { defineStore } from 'pinia'
import api from '../api/axios'

export interface NotificationDetails {
  studentName?: string
  teacherName?: string
  classDate?: string
  timeSlot?: string
  startTime?: string
  endTime?: string
  durationMinutes?: number
  subject?: string
  meetingInfo?: string
  meetingLink?: string
  [key: string]: unknown
}

export interface AppNotification {
  id: number
  type: string
  title: string
  message: string
  relatedRequestId: number | null
  relatedClassId: number | null
  details: NotificationDetails | null
  isRead: boolean
  createdAt: string
}

interface NotificationsState {
  notifications: AppNotification[]
  unreadCount: number
  loading: boolean
  error: string | null
}

export const useNotificationsStore = defineStore('notifications', {
  state: (): NotificationsState => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
  }),

  actions: {
    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{
          unreadCount: number
          notifications: AppNotification[]
        }>('/notifications')
        this.unreadCount = res.data.unreadCount
        this.notifications = res.data.notifications
      } catch (err) {
        this.error = 'Could not load notifications'
        throw err
      } finally {
        this.loading = false
      }
    },

    async markRead(id: number) {
      await api.patch(`/notifications/${id}/read`)
      this.notifications = this.notifications.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      )
      this.unreadCount = this.notifications.filter((item) => !item.isRead).length
    },

    async markAllRead() {
      await api.patch('/notifications/read-all')
      this.notifications = this.notifications.map((item) => ({ ...item, isRead: true }))
      this.unreadCount = 0
    },
  },
})
