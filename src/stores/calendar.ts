import { defineStore } from 'pinia'
import api from '../api/axios'

export interface CalendarEvent {
  id: number
  userId: number
  classId: number | null
  title: string
  description: string
  eventDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  meetingInfo: string
  meetingLink: string
  provider: 'lectihub' | 'google' | 'calendly'
  externalEventId: string | null
  syncStatus: 'pending' | 'synced' | 'failed' | 'local_only'
  syncedAt: string | null
  createdAt: string
}

export interface CalendarConnection {
  id: number
  userId: number
  provider: 'google' | 'calendly'
  externalAccount: string
  calendarId: string
  schedulingUrl: string
  isActive: boolean
  connectedAt: string
  hasAccessToken: boolean
}

interface CalendarState {
  events: CalendarEvent[]
  connections: CalendarConnection[]
  providers: {
    google: { available: boolean; liveSync: boolean }
    calendly: { available: boolean; liveSync: boolean }
  } | null
  loading: boolean
  connecting: boolean
  error: string | null
}

export const useCalendarStore = defineStore('calendar', {
  state: (): CalendarState => ({
    events: [],
    connections: [],
    providers: null,
    loading: false,
    connecting: false,
    error: null,
  }),

  getters: {
    upcoming(state): CalendarEvent[] {
      const today = new Date().toISOString().slice(0, 10)
      // Prefer LectiHub entries for the main calendar list
      return state.events.filter(
        (item) => item.eventDate >= today && item.provider === 'lectihub',
      )
    },
    googleConnected(state): boolean {
      return state.connections.some((c) => c.provider === 'google' && c.isActive)
    },
    calendlyConnected(state): boolean {
      return state.connections.some((c) => c.provider === 'calendly' && c.isActive)
    },
  },

  actions: {
    async fetchMine() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{
          events: CalendarEvent[]
          connections: CalendarConnection[]
          providers: CalendarState['providers']
        }>('/calendar/mine')
        this.events = res.data.events
        this.connections = res.data.connections
        this.providers = res.data.providers
      } catch (err) {
        this.error = 'Could not load calendar'
        throw err
      } finally {
        this.loading = false
      }
    },

    async connectProvider(
      provider: 'google' | 'calendly',
      payload: {
        externalAccount?: string
        accessToken?: string
        calendarId?: string
        schedulingUrl?: string
      } = {},
    ) {
      this.connecting = true
      this.error = null
      try {
        await api.post('/calendar/connect', { provider, ...payload })
        await this.fetchMine()
      } catch (err) {
        this.error = 'Could not connect calendar provider'
        throw err
      } finally {
        this.connecting = false
      }
    },

    async disconnectProvider(provider: 'google' | 'calendly') {
      this.connecting = true
      try {
        await api.delete(`/calendar/connect/${provider}`)
        await this.fetchMine()
      } finally {
        this.connecting = false
      }
    },
  },
})
