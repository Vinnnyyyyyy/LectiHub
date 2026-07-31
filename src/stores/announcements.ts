import { defineStore } from 'pinia'
import api from '../api/axios'

export type AudienceType = 'everyone' | 'students' | 'teachers' | 'course' | 'people'

export interface Announcement {
  id: number
  subject: string
  body: string
  audienceType: AudienceType
  courseId: number | null
  course: { id: number; title: string } | null
  sendEmail: boolean
  status: 'draft' | 'scheduled' | 'sent'
  scheduledFor: string | null
  sentAt: string | null
  author: { id: number; fullName: string } | null
  recipientCount: number
  readCount: number
  targetIds: number[]
  createdAt: string
}

export interface ReceivedAnnouncement {
  id: number
  recipientId: number
  subject: string
  body: string
  sentAt: string | null
  isRead: boolean
  readAt: string | null
  author: { id: number; fullName: string } | null
}

export interface AnnouncementDraft {
  subject: string
  body: string
  audienceType: AudienceType
  courseId?: number | null
  userIds?: number[]
  sendEmail?: boolean
  scheduledFor?: string | null
  send?: boolean
}

interface AnnouncementsState {
  announcements: Announcement[]
  received: ReceivedAnnouncement[]
  /** Reach for the audience currently being composed. */
  previewCount: number | null
  loading: boolean
  submitting: boolean
  error: string | null
  message: string | null
}

function messageFrom(err: unknown, fallback: string) {
  const axiosErr = err as { response?: { data?: { message?: string } } }
  return axiosErr.response?.data?.message || fallback
}

export const useAnnouncementsStore = defineStore('announcements', {
  state: (): AnnouncementsState => ({
    announcements: [],
    received: [],
    previewCount: null,
    loading: false,
    submitting: false,
    error: null,
    message: null,
  }),

  getters: {
    drafts(state): Announcement[] {
      return state.announcements.filter((item) => item.status === 'draft')
    },
    scheduled(state): Announcement[] {
      return state.announcements.filter((item) => item.status === 'scheduled')
    },
    sent(state): Announcement[] {
      return state.announcements.filter((item) => item.status === 'sent')
    },
    unreadCount(state): number {
      return state.received.filter((item) => !item.isRead).length
    },
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ announcements: Announcement[] }>('/announcements')
        this.announcements = res.data.announcements || []
      } catch (err) {
        this.error = messageFrom(err, 'Could not load announcements')
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ announcements: ReceivedAnnouncement[] }>('/announcements/mine')
        this.received = res.data.announcements || []
      } catch (err) {
        this.error = messageFrom(err, 'Could not load announcements')
        throw err
      } finally {
        this.loading = false
      }
    },

    /** Counts the reach without writing anything, for the send button. */
    async preview(payload: {
      audienceType: AudienceType
      courseId?: number | null
      userIds?: number[]
    }) {
      try {
        const res = await api.post<{ count: number }>('/announcements/preview', payload)
        this.previewCount = res.data.count
        return res.data.count
      } catch {
        this.previewCount = null
        return null
      }
    },

    async create(draft: AnnouncementDraft) {
      this.submitting = true
      this.error = null
      this.message = null
      try {
        const res = await api.post<{ message: string; announcement: Announcement }>(
          '/announcements',
          draft,
        )
        this.announcements.unshift(res.data.announcement)
        this.message = res.data.message
        return res.data.announcement
      } catch (err) {
        this.error = messageFrom(err, 'Could not save that announcement')
        throw err
      } finally {
        this.submitting = false
      }
    },

    async send(id: number) {
      this.submitting = true
      this.error = null
      this.message = null
      try {
        const res = await api.post<{ message: string; announcement: Announcement }>(
          `/announcements/${id}/send`,
        )
        const index = this.announcements.findIndex((item) => item.id === id)
        if (index >= 0) this.announcements[index] = res.data.announcement
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not send that announcement')
        throw err
      } finally {
        this.submitting = false
      }
    },

    async remove(id: number) {
      this.error = null
      this.message = null
      try {
        const res = await api.delete<{ message: string }>(`/announcements/${id}`)
        this.announcements = this.announcements.filter((item) => item.id !== id)
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not delete that announcement')
        throw err
      }
    },

    async markRead(id: number) {
      try {
        await api.patch(`/announcements/${id}/read`)
        const item = this.received.find((entry) => entry.id === id)
        if (item) {
          item.isRead = true
          item.readAt = new Date().toISOString()
        }
      } catch (err) {
        this.error = messageFrom(err, 'Could not mark that as read')
      }
    },
  },
})
