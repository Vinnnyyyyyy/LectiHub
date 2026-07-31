import { defineStore } from 'pinia'
import api from '../api/axios'

export interface HomeworkSubmission {
  body: string
  fileName: string | null
  hasFile: boolean
  submittedAt: string | null
  score: number | null
  feedback: string
  gradedAt: string | null
}

export interface HomeworkItem {
  id: number
  title: string
  instructions: string
  dueAt: string | null
  maxScore: number
  status: 'pending' | 'submitted' | 'graded'
  courseId: number | null
  course: { id: number; title: string } | null
  classId: number | null
  teacher: { id: number; fullName: string } | null
  student: { id: number; fullName: string } | null
  submission: HomeworkSubmission | null
  createdAt: string
}

export interface HomeworkSummary {
  total: number
  pending: number
  submitted: number
  graded: number
  /** Percentage across graded work, each score scaled to its own max. */
  average: number | null
}

interface HomeworkState {
  items: HomeworkItem[]
  summary: HomeworkSummary
  loading: boolean
  submittingId: number | null
  gradingId: number | null
  error: string | null
  message: string | null
}

function messageFrom(err: unknown, fallback: string) {
  const axiosErr = err as { response?: { data?: { message?: string } } }
  return axiosErr.response?.data?.message || fallback
}

const EMPTY_SUMMARY: HomeworkSummary = {
  total: 0,
  pending: 0,
  submitted: 0,
  graded: 0,
  average: null,
}

export const useHomeworkStore = defineStore('homework', {
  state: (): HomeworkState => ({
    items: [],
    summary: { ...EMPTY_SUMMARY },
    loading: false,
    submittingId: null,
    gradingId: null,
    error: null,
    message: null,
  }),

  getters: {
    pending(state): HomeworkItem[] {
      return state.items.filter((item) => item.status === 'pending')
    },
    submitted(state): HomeworkItem[] {
      return state.items.filter((item) => item.status === 'submitted')
    },
    graded(state): HomeworkItem[] {
      return state.items
        .filter((item) => item.status === 'graded')
        .sort((a, b) => ((a.submission?.gradedAt ?? '') < (b.submission?.gradedAt ?? '') ? 1 : -1))
    },
    /** Due soonest first, for the "up next" panel on the week view. */
    dueSoon(state): HomeworkItem[] {
      return state.items
        .filter((item) => item.status === 'pending' && item.dueAt)
        .sort((a, b) => ((a.dueAt ?? '') < (b.dueAt ?? '') ? -1 : 1))
    },
  },

  actions: {
    async fetchMine(studentId?: number) {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ homework: HomeworkItem[]; summary: HomeworkSummary }>(
          '/homework',
          { params: studentId ? { studentId } : undefined },
        )
        this.items = res.data.homework || []
        this.summary = res.data.summary || { ...EMPTY_SUMMARY }
      } catch (err) {
        this.error = messageFrom(err, 'Could not load homework')
        throw err
      } finally {
        this.loading = false
      }
    },

    async create(payload: {
      studentId: number
      title: string
      instructions?: string
      dueAt?: string
      maxScore?: number
      classId?: number
      courseId?: number
      lessonReportId?: number
    }) {
      this.error = null
      this.message = null
      try {
        const res = await api.post<{ message: string; homework: HomeworkItem }>(
          '/homework',
          payload,
        )
        this.items.push(res.data.homework)
        this.message = res.data.message
        return res.data.homework
      } catch (err) {
        this.error = messageFrom(err, 'Could not set homework')
        throw err
      }
    },

    async submit(id: number, payload: { body?: string; file?: File | null }) {
      this.submittingId = id
      this.error = null
      this.message = null
      try {
        const body = new FormData()
        if (payload.body) body.append('body', payload.body)
        if (payload.file) body.append('file', payload.file)

        const res = await api.post<{ message: string; homework: HomeworkItem }>(
          `/homework/${id}/submit`,
          body,
        )
        this.replace(res.data.homework)
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not submit that homework')
        throw err
      } finally {
        this.submittingId = null
      }
    },

    async grade(id: number, payload: { score: number; feedback?: string }) {
      this.gradingId = id
      this.error = null
      this.message = null
      try {
        const res = await api.post<{ message: string; homework: HomeworkItem }>(
          `/homework/${id}/grade`,
          payload,
        )
        this.replace(res.data.homework)
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not grade that homework')
        throw err
      } finally {
        this.gradingId = null
      }
    },

    async remove(id: number) {
      this.error = null
      this.message = null
      try {
        const res = await api.delete<{ message: string }>(`/homework/${id}`)
        this.items = this.items.filter((item) => item.id !== id)
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not remove that homework')
        throw err
      }
    },

    /** Streams through the API so ownership is checked per request. */
    async downloadSubmission(item: HomeworkItem) {
      this.error = null
      try {
        const res = await api.get<Blob>(`/homework/${item.id}/file`, { responseType: 'blob' })
        const url = URL.createObjectURL(res.data)
        const link = document.createElement('a')
        link.href = url
        link.download = item.submission?.fileName || item.title
        link.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        this.error = messageFrom(err, 'Could not download that file')
        throw err
      }
    },

    /** Swaps an item in place and recomputes what the list-level summary tracks. */
    replace(updated: HomeworkItem) {
      const index = this.items.findIndex((item) => item.id === updated.id)
      if (index >= 0) this.items[index] = updated
      else this.items.push(updated)

      const graded = this.items.filter((item) => item.status === 'graded')
      const average = graded.length
        ? Math.round(
            (graded.reduce(
              (sum, item) =>
                sum + ((item.submission?.score ?? 0) / Math.max(1, item.maxScore)) * 100,
              0,
            ) /
              graded.length) *
              10,
          ) / 10
        : null

      this.summary = {
        total: this.items.length,
        pending: this.items.filter((item) => item.status === 'pending').length,
        submitted: this.items.filter((item) => item.status === 'submitted').length,
        graded: graded.length,
        average,
      }
    },
  },
})
