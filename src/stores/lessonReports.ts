import { defineStore } from 'pinia'
import api from '../api/axios'

export interface LessonReport {
  id: number
  classId: number
  teacherId: number
  studentId: number
  reportDate: string
  reportTime: string
  lessonTopic: string
  pagesDiscussed: string
  attendanceStatus: string
  attendanceStatusLabel: string
  homeworkAssigned: string
  remarks: string
  studentProgress: string
  submittedAt: string | null
  updatedAt: string | null
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

export interface LessonReportPayload {
  reportDate: string
  reportTime: string
  lessonTopic: string
  pagesDiscussed?: string
  attendanceStatus: string
  homeworkAssigned?: string
  remarks?: string
  studentProgress: string
}

interface SubmitResponse {
  message: string
  report: LessonReport
}

interface LessonReportsState {
  reports: LessonReport[]
  loading: boolean
  submittingId: number | null
  error: string | null
  message: string | null
}

export const useLessonReportsStore = defineStore('lessonReports', {
  state: (): LessonReportsState => ({
    reports: [],
    loading: false,
    submittingId: null,
    error: null,
    message: null,
  }),

  getters: {
    byClassId(state) {
      return (classId: number) => state.reports.find((item) => item.classId === classId) || null
    },
  },

  actions: {
    upsertReport(report: LessonReport) {
      const index = this.reports.findIndex((item) => item.id === report.id)
      if (index >= 0) this.reports[index] = report
      else this.reports.unshift(report)
    },

    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<LessonReport[]>('/lesson-reports')
        this.reports = res.data
      } catch (err) {
        this.error = 'Could not load lesson reports'
        throw err
      } finally {
        this.loading = false
      }
    },

    async submitForClass(classId: number, payload: LessonReportPayload) {
      this.submittingId = classId
      this.error = null
      this.message = null
      try {
        const res = await api.post<SubmitResponse>(`/classes/${classId}/report`, payload)
        this.upsertReport(res.data.report)
        this.message = res.data.message
        return res.data
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not submit lesson report'
        this.error = message
        throw err
      } finally {
        this.submittingId = null
      }
    },
  },
})
