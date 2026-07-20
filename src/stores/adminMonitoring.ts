import { defineStore } from 'pinia'
import api from '../api/axios'
import type { ConfirmedSchedule } from './classes'
import type { LessonReport } from './lessonReports'
import type { StudentFeedback } from './studentFeedback'

export interface MonitoringSummary {
  completedClasses: number
  inProgressClasses: number
  scheduledClasses: number
  lessonReports: number
  studentFeedback: number
  averageFeedbackRating: number | null
  attendanceRecorded: number
  attendancePresentRate: number
  pendingScheduleRequests: number
  approvedScheduleRequests: number
  studentsWithProgressNotes: number
  activeTeachers: number
}

export interface SchedulingStats {
  totalRequests: number
  pending: number
  approved: number
  rejected: number
  approvalRate: number
  averageApprovalHours: number | null
}

export interface AttendanceStats {
  totalClasses: number
  recorded: number
  notRecorded: number
  present: number
  late: number
  absent: number
  excused: number
  recordedRate: number
  presentRate: number
}

export interface ClassStats {
  total: number
  scheduled: number
  inProgress: number
  completed: number
  cancelled: number
  completionRate: number
}

export interface TeacherPerformance {
  id: number
  username: string
  fullName: string
  email: string
  subjectExpertise: string
  completedClasses: number
  reportsSubmitted: number
  feedbackCount: number
  averageRating: number | null
  attendanceRecorded: number
}

export interface AttendanceRecord {
  id: number
  classDate: string
  title: string
  subject: string
  attendanceStatus: string
  attendanceStatusLabel: string
  status: string
  teacher: ConfirmedSchedule['teacher']
  student: ConfirmedSchedule['student']
}

export interface AdminMonitoringOverview {
  generatedAt: string
  summary: MonitoringSummary
  classStats: ClassStats
  scheduling: SchedulingStats
  attendance: AttendanceStats
  teacherPerformance: TeacherPerformance[]
  recentCompletedClasses: ConfirmedSchedule[]
  recentLessonReports: LessonReport[]
  recentStudentFeedback: StudentFeedback[]
  attendanceRecords: AttendanceRecord[]
}

interface AdminMonitoringState {
  overview: AdminMonitoringOverview | null
  loading: boolean
  error: string | null
}

export const useAdminMonitoringStore = defineStore('adminMonitoring', {
  state: (): AdminMonitoringState => ({
    overview: null,
    loading: false,
    error: null,
  }),

  actions: {
    async fetchOverview() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<AdminMonitoringOverview>('/admin/monitoring')
        this.overview = res.data
      } catch (err) {
        this.error = 'Could not load administrative monitoring data'
        throw err
      } finally {
        this.loading = false
      }
    },
  },
})
