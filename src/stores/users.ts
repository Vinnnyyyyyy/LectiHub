import { defineStore } from 'pinia'
import api from '../api/axios'

export interface ManagedUser {
  id: number
  username: string
  email: string
  fullName: string
  role: 'admin' | 'teacher' | 'student'
  createdAt: string
}

interface UsersState {
  users: ManagedUser[]
  loading: boolean
  deletingId: number | null
  error: string | null
  message: string | null
}

export const useUsersStore = defineStore('users', {
  state: (): UsersState => ({
    users: [],
    loading: false,
    deletingId: null,
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
