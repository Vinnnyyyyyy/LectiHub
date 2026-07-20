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
  curriculumPlan?: string
  attendanceStatus?: string
  attendanceStatusLabel?: string
  attendanceRecordedAt?: string | null
  participationLevel?: string
  participationLevelLabel?: string
  participationNotes?: string
  recordingUrl?: string
  hasRecording?: boolean
  completedAt?: string | null
  archivedAt?: string | null
  isArchived?: boolean
  hasLessonReport?: boolean
  lessonReportId?: number | null
  lessonReportSubmittedAt?: string | null
  hasStudentFeedback?: boolean
  studentFeedbackId?: number | null
  studentFeedbackRating?: number | null
  studentFeedbackSubmittedAt?: string | null
  isFullyComplete?: boolean
  lessonTopic?: string
  studentProgress?: string
  homeworkAssigned?: string
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

export interface LessonConductPayload {
  curriculumPlan?: string
  attendanceStatus?: string
  participationLevel?: string
  participationNotes?: string
  recordingUrl?: string
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

interface ConductResponse {
  message: string
  class: ConfirmedSchedule
}

interface ClassesState {
  schedules: ConfirmedSchedule[]
  history: ConfirmedSchedule[]
  loading: boolean
  loadingHistory: boolean
  joiningId: number | null
  savingId: number | null
  error: string | null
  joinMessage: string | null
  conductMessage: string | null
}

export const useClassesStore = defineStore('classes', {
  state: (): ClassesState => ({
    schedules: [],
    history: [],
    loading: false,
    loadingHistory: false,
    joiningId: null,
    savingId: null,
    error: null,
    joinMessage: null,
    conductMessage: null,
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
    inProgress(state): ConfirmedSchedule[] {
      return state.schedules.filter((item) => item.status === 'in_progress')
    },
    archived(state): ConfirmedSchedule[] {
      return state.history.length
        ? state.history
        : state.schedules.filter((item) => item.isArchived || item.archivedAt)
    },
  },

  actions: {
    upsertSchedule(updated: ConfirmedSchedule) {
      const index = this.schedules.findIndex((item) => item.id === updated.id)
      if (index >= 0) {
        this.schedules[index] = updated
      } else {
        this.schedules.push(updated)
      }
    },

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
        this.upsertSchedule(res.data.class)
        this.joinMessage = res.data.message
        const link = res.data.meeting?.link || res.data.class.meetingLink
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

    async saveConduct(classId: number, payload: LessonConductPayload) {
      this.savingId = classId
      this.error = null
      this.conductMessage = null
      try {
        const res = await api.patch<ConductResponse>(`/classes/${classId}/conduct`, payload)
        this.upsertSchedule(res.data.class)
        this.conductMessage = res.data.message
        return res.data
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not save lesson details'
        this.error = message
        throw err
      } finally {
        this.savingId = null
      }
    },

    async completeClass(classId: number, payload: LessonConductPayload = {}) {
      this.savingId = classId
      this.error = null
      this.conductMessage = null
      try {
        const res = await api.post<ConductResponse>(`/classes/${classId}/complete`, payload)
        this.upsertSchedule(res.data.class)
        this.conductMessage = res.data.message
        return res.data
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not complete the lesson'
        this.error = message
        throw err
      } finally {
        this.savingId = null
      }
    },

    async fetchHistory() {
      this.loadingHistory = true
      try {
        const res = await api.get<ConfirmedSchedule[]>('/classes/history')
        this.history = res.data
        for (const item of res.data) {
          this.upsertSchedule(item)
        }
      } catch (err) {
        this.error = 'Could not load class history'
        throw err
      } finally {
        this.loadingHistory = false
      }
    },
  },
})
