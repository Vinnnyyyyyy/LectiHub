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
  status: string
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

interface ClassesState {
  schedules: ConfirmedSchedule[]
  loading: boolean
  error: string | null
}

export const useClassesStore = defineStore('classes', {
  state: (): ClassesState => ({
    schedules: [],
    loading: false,
    error: null,
  }),

  getters: {
    upcoming(state): ConfirmedSchedule[] {
      const today = new Date().toISOString().slice(0, 10)
      return state.schedules.filter((item) => item.classDate >= today)
    },
    past(state): ConfirmedSchedule[] {
      const today = new Date().toISOString().slice(0, 10)
      return state.schedules.filter((item) => item.classDate < today)
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
  },
})
