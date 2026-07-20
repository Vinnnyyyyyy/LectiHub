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
  reminderWindow?: string
  reminderLabel?: string
  remindersScheduled?: string[]
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
  deliverAt: string | null
  isRead: boolean
  createdAt: string
}

export interface PendingReminder {
  id: number
  type: string
  title: string
  deliverAt: string
  relatedClassId: number | null
  relatedRequestId: number | null
  details: NotificationDetails | null
}

interface NotificationsState {
  notifications: AppNotification[]
  pendingReminders: PendingReminder[]
  unreadCount: number
  loading: boolean
  error: string | null
}

export const useNotificationsStore = defineStore('notifications', {
  state: (): NotificationsState => ({
    notifications: [],
    pendingReminders: [],
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
          pendingReminders?: PendingReminder[]
        }>('/notifications')
        this.unreadCount = res.data.unreadCount
        this.notifications = res.data.notifications
        this.pendingReminders = res.data.pendingReminders || []
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
