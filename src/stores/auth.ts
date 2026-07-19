import { defineStore } from 'pinia'
import api from '../api/axios'

interface AuthState {
  token: string | null
  role: string | null
  username: string | null
  fullName: string | null
  mustChangePassword: boolean
}

function persistSession(state: AuthState) {
  if (state.token) localStorage.setItem('token', state.token)
  else localStorage.removeItem('token')

  if (state.role) localStorage.setItem('role', state.role)
  else localStorage.removeItem('role')

  if (state.username) localStorage.setItem('username', state.username)
  else localStorage.removeItem('username')

  if (state.fullName) localStorage.setItem('fullName', state.fullName)
  else localStorage.removeItem('fullName')

  localStorage.setItem('mustChangePassword', String(state.mustChangePassword))
}

function applyAuthPayload(
  store: AuthState,
  data: {
    token: string
    role: string
    username?: string
    fullName?: string
    mustChangePassword?: boolean
  },
) {
  store.token = data.token
  store.role = data.role
  store.username = data.username ?? null
  store.fullName = data.fullName ?? data.username ?? null
  store.mustChangePassword = !!data.mustChangePassword
  persistSession(store)
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem('token'),
    role: localStorage.getItem('role'),
    username: localStorage.getItem('username'),
    fullName: localStorage.getItem('fullName'),
    mustChangePassword: localStorage.getItem('mustChangePassword') === 'true',
  }),

  actions: {
    async login(username: string, password: string) {
      const res = await api.post('/auth/login', { username, password })
      applyAuthPayload(this, res.data)
    },

    async register(payload: {
      username: string
      email: string
      password: string
      full_name?: string
    }) {
      const res = await api.post('/auth/register', payload)
      applyAuthPayload(this, res.data)
    },

    logout() {
      this.token = null
      this.role = null
      this.username = null
      this.fullName = null
      this.mustChangePassword = false
      persistSession(this)
    },
  },
})
