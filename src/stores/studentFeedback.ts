import { defineStore } from 'pinia'
import api from '../api/axios'
import type { LessonReport } from './lessonReports'

export interface StudentFeedback {
  id: number
  lessonReportId: number
  classId: number
  studentId: number
  teacherId: number
  overallRating: number | null
  comments: string
  suggestions: string
  learningExperience: string
  submittedAt: string | null
  lessonTopic?: string | null
  reportDate?: string | null
  classTitle?: string | null
  classSubject?: string | null
  teacher: {
    id: number
    username: string
    fullName: string
    email: string
  } | null
  student: {
    id: number
    username: string
    fullName: string
    email: string
  } | null
}

export interface StudentFeedbackPayload {
  overallRating: number
  comments: string
  suggestions?: string
  learningExperience: string
}

interface SubmitResponse {
  message: string
  feedback: StudentFeedback
}

interface StudentFeedbackState {
  feedback: StudentFeedback[]
  loading: boolean
  submittingId: number | null
  error: string | null
  message: string | null
}

export const useStudentFeedbackStore = defineStore('studentFeedback', {
  state: (): StudentFeedbackState => ({
    feedback: [],
    loading: false,
    submittingId: null,
    error: null,
    message: null,
  }),

  getters: {
    byReportId(state) {
      return (reportId: number) =>
        state.feedback.find((item) => item.lessonReportId === reportId) || null
    },
  },

  actions: {
    upsertFeedback(item: StudentFeedback) {
      const index = this.feedback.findIndex((row) => row.id === item.id)
      if (index >= 0) this.feedback[index] = item
      else this.feedback.unshift(item)
    },

    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<StudentFeedback[]>('/student-feedback')
        this.feedback = res.data
      } catch (err) {
        this.error = 'Could not load student feedback'
        throw err
      } finally {
        this.loading = false
      }
    },

    async submitForReport(reportId: number, payload: StudentFeedbackPayload) {
      this.submittingId = reportId
      this.error = null
      this.message = null
      try {
        const res = await api.post<SubmitResponse>(
          `/lesson-reports/${reportId}/feedback`,
          payload,
        )
        this.upsertFeedback(res.data.feedback)
        this.message = res.data.message
        return res.data
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not submit feedback'
        this.error = message
        throw err
      } finally {
        this.submittingId = null
      }
    },

    pendingReports(reports: LessonReport[]) {
      return reports.filter((report) => !report.hasFeedback)
    },
  },
})
