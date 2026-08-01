import { defineStore } from 'pinia'
import api from '../api/axios'

export interface ManagedUser {
  id: number
  username: string
  email: string
  fullName: string
  role: 'admin' | 'teacher' | 'student'
  createdAt: string
  subjectExpertise: string
  /** Directory roll-ups — teacher-oriented, null outside list responses. */
  weeklyMinutes: number | null
  studentCount: number | null
  calendarProvider: 'google' | 'calendly' | null
}

interface UsersState {
  users: ManagedUser[]
  loading: boolean
  deletingId: number | null
  passwordUserId: number | null
  error: string | null
  message: string | null
}

export const useUsersStore = defineStore('users', {
  state: (): UsersState => ({
    users: [],
    loading: false,
    deletingId: null,
    passwordUserId: null,
    error: null,
    message: null,
  }),

  actions: {
    async fetchAll(role?: string) {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ users: ManagedUser[] }>('/users', {
          params: role ? { role } : undefined,
        })
        this.users = res.data.users || []
      } catch (err) {
        this.error = 'Could not load users'
        throw err
      } finally {
        this.loading = false
      }
    },

    async createTeacher(payload: {
      username: string
      email?: string
      password: string
      fullName?: string
      subjectExpertise?: string
    }) {
      this.error = null
      this.message = null
      try {
        const res = await api.post<{ message: string; username: string; tempPassword: string }>(
          '/users/create',
          {
            username: payload.username,
            email: payload.email,
            password: payload.password,
            full_name: payload.fullName,
            subject_expertise: payload.subjectExpertise,
            role: 'teacher',
          },
        )
        this.message = `${res.data.message}. Temporary password: ${res.data.tempPassword}`
        await this.fetchAll()
        return res.data
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        this.error = axiosErr.response?.data?.message || 'Could not create teacher'
        throw err
      }
    },

    async changePassword(userId: number, password: string) {
      this.passwordUserId = userId
      this.error = null
      this.message = null
      try {
        const res = await api.patch<{ message: string }>(`/users/${userId}/password`, {
          password,
        })
        this.message = res.data.message
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        this.error = axiosErr.response?.data?.message || 'Could not change password'
        throw err
      } finally {
        this.passwordUserId = null
      }
    },

    async deleteUser(userId: number) {
      this.deletingId = userId
      this.error = null
      this.message = null
      try {
        const res = await api.delete<{ message: string }>(`/users/${userId}`)
        this.message = res.data.message
        this.users = this.users.filter((user) => user.id !== userId)
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        this.error = axiosErr.response?.data?.message || 'Could not delete user'
        throw err
      } finally {
        this.deletingId = null
      }
    },
  },
})
