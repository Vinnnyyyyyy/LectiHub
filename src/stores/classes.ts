import { defineStore } from 'pinia'
import api from '../api/axios'

export interface ConfirmedSchedule {
  id: number
  teacherId: number
  studentId: number | null
  scheduleRequestId: number | null
  classDate: string
  timeSlot: string
  startTime: string | null
  endTime: string | null
  durationMinutes: number
  title: string
  subject: string
  meetingInfo: string
  meetingLink: string
  meetingProvider?: string
  status: string
  statusLabel?: string
  canJoin?: boolean
  joinReason?: string
  withinJoinWindow?: boolean
  startedAt?: string | null
  createdAt: string
  teacher: {
    id: number
    username: string
    fullName: string
    email: string
    subjectExpertise?: string
  } | null
  student: {
    id: number
    username: string
    fullName: string
    email: string
  } | null
}

interface JoinClassResponse {
  message: string
  class: ConfirmedSchedule
  meeting: {
    provider: string
    link: string
    info: string
  }
}

interface ClassesState {
  schedules: ConfirmedSchedule[]
  loading: boolean
  joiningId: number | null
  error: string | null
  joinMessage: string | null
}

export const useClassesStore = defineStore('classes', {
  state: (): ClassesState => ({
    schedules: [],
    loading: false,
    joiningId: null,
    error: null,
    joinMessage: null,
  }),

  getters: {
    upcoming(state): ConfirmedSchedule[] {
      const today = new Date().toISOString().slice(0, 10)
      return state.schedules.filter(
        (item) =>
          item.status === 'in_progress' ||
          (item.status !== 'completed' && item.status !== 'cancelled' && item.classDate >= today),
      )
    },
    past(state): ConfirmedSchedule[] {
      const today = new Date().toISOString().slice(0, 10)
      return state.schedules.filter(
        (item) =>
          item.status === 'completed' ||
          (item.status !== 'in_progress' && item.classDate < today),
      )
    },
  },

  actions: {
    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<ConfirmedSchedule[]>('/classes/mine')
        this.schedules = res.data
      } catch (err) {
        this.error = 'Could not load class schedules'
        throw err
      } finally {
        this.loading = false
      }
    },

    async joinClass(classId: number) {
      this.joiningId = classId
      this.error = null
      this.joinMessage = null
      try {
        const res = await api.post<JoinClassResponse>(`/classes/${classId}/join`)
        const updated = res.data.class
        const index = this.schedules.findIndex((item) => item.id === updated.id)
        if (index >= 0) {
          this.schedules[index] = updated
        } else {
          this.schedules.push(updated)
        }
        this.joinMessage = res.data.message
        const link = res.data.meeting?.link || updated.meetingLink
        if (link && typeof window !== 'undefined') {
          window.open(link, '_blank', 'noopener,noreferrer')
        }
        return res.data
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not join the class'
        this.error = message
        throw err
      } finally {
        this.joiningId = null
      }
    },
  },
})
