import { defineStore } from 'pinia'
import api from '../api/axios'

/** Keys are dotted strings, so the map is intentionally loose. */
export type SettingsMap = Record<string, unknown>

interface SettingsState {
  settings: SettingsMap
  defaults: SettingsMap
  loading: boolean
  saving: boolean
  error: string | null
  message: string | null
  /** Keys the API dropped on the last save — unknown or wrongly typed. */
  ignored: string[]
}

function messageFrom(err: unknown, fallback: string) {
  const axiosErr = err as { response?: { data?: { message?: string } } }
  return axiosErr.response?.data?.message || fallback
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    settings: {},
    defaults: {},
    loading: false,
    saving: false,
    error: null,
    message: null,
    ignored: [],
  }),

  getters: {
    /** Reads a key with its default as the fallback. */
    value:
      (state) =>
      <T>(key: string, fallback: T): T =>
        (state.settings[key] as T) ?? (state.defaults[key] as T) ?? fallback,
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ settings: SettingsMap; defaults: SettingsMap }>(
          '/admin/settings',
        )
        this.settings = res.data.settings || {}
        this.defaults = res.data.defaults || {}
      } catch (err) {
        this.error = messageFrom(err, 'Could not load settings')
        throw err
      } finally {
        this.loading = false
      }
    },

    /** Reads the subset any signed-in user may see. */
    async fetchPublic() {
      this.error = null
      try {
        const res = await api.get<{ settings: SettingsMap }>('/settings')
        this.settings = { ...this.settings, ...(res.data.settings || {}) }
      } catch (err) {
        this.error = messageFrom(err, 'Could not load settings')
        throw err
      }
    },

    async save(changes: SettingsMap) {
      this.saving = true
      this.error = null
      this.message = null
      this.ignored = []
      try {
        const res = await api.put<{
          message: string
          applied: string[]
          ignored: string[]
          settings: SettingsMap
        }>('/admin/settings', { settings: changes })

        this.settings = res.data.settings || {}
        this.message = res.data.message
        this.ignored = res.data.ignored || []
      } catch (err) {
        this.error = messageFrom(err, 'Could not save settings')
        throw err
      } finally {
        this.saving = false
      }
    },
  },
})
