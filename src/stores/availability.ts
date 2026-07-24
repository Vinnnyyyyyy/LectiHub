import { defineStore } from 'pinia'
import api from '../api/axios'
import { TIME_SLOTS } from '../constants/timeSlots'

export interface OpenSlot {
  timeSlot: string
  availableTeacherCount: number
}

export interface OpenDate {
  date: string
  slots: OpenSlot[]
}

export interface WeeklyAvailabilitySlot {
  weekday: number
  timeSlot: string
  isOpen: boolean
}

interface AvailabilityState {
  openDates: string[]
  openByDate: Record<string, OpenSlot[]>
  timeSlots: string[]
  from: string | null
  to: string | null
  loadingOpen: boolean
  mySlots: WeeklyAvailabilitySlot[]
  loadingMine: boolean
  savingMine: boolean
  error: string | null
}

export const useAvailabilityStore = defineStore('availability', {
  state: (): AvailabilityState => ({
    openDates: [],
    openByDate: {},
    timeSlots: [...TIME_SLOTS],
    from: null,
    to: null,
    loadingOpen: false,
    mySlots: [],
    loadingMine: false,
    savingMine: false,
    error: null,
  }),

  getters: {
    openDateSet(state): Set<string> {
      return new Set(state.openDates)
    },
  },

  actions: {
    async fetchOpen(from?: string, to?: string) {
      this.loadingOpen = true
      this.error = null
      try {
        const res = await api.get<{
          from: string
          to: string
          timeSlots: string[]
          dates: OpenDate[]
          openDates: string[]
        }>('/availability/open', {
          params: { from, to },
        })
        this.from = res.data.from
        this.to = res.data.to
        this.timeSlots = res.data.timeSlots?.length ? res.data.timeSlots : [...TIME_SLOTS]
        this.openDates = res.data.openDates || []
        const map: Record<string, OpenSlot[]> = {}
        for (const day of res.data.dates || []) {
          map[day.date] = day.slots
        }
        this.openByDate = map
      } catch (err) {
        this.error = 'Could not load open teacher availability'
        throw err
      } finally {
        this.loadingOpen = false
      }
    },

    slotsForDate(date: string): OpenSlot[] {
      return this.openByDate[date] || []
    },

    async fetchMine() {
      this.loadingMine = true
      this.error = null
      try {
        const res = await api.get<{
          timeSlots: string[]
          slots: WeeklyAvailabilitySlot[]
        }>('/availability/mine')
        this.timeSlots = res.data.timeSlots?.length ? res.data.timeSlots : [...TIME_SLOTS]
        this.mySlots = res.data.slots || []
      } catch (err) {
        this.error = 'Could not load your availability'
        throw err
      } finally {
        this.loadingMine = false
      }
    },

    async saveMine(slots: WeeklyAvailabilitySlot[]) {
      this.savingMine = true
      this.error = null
      try {
        const res = await api.put<{
          slots: WeeklyAvailabilitySlot[]
          timeSlots: string[]
        }>('/availability/mine', { slots })
        this.mySlots = res.data.slots || []
        this.timeSlots = res.data.timeSlots?.length ? res.data.timeSlots : [...TIME_SLOTS]
      } catch (err) {
        this.error = 'Could not save your availability'
        throw err
      } finally {
        this.savingMine = false
      }
    },
  },
})
