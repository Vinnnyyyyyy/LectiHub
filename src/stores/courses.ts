import { defineStore } from 'pinia'
import api from '../api/axios'

export interface CourseTeacher {
  id: number
  username: string
  fullName: string
  email: string
}

export interface Course {
  id: number
  title: string
  subject: string
  description: string
  isActive: boolean
  teacherId: number | null
  teacher: CourseTeacher | null
  materialCount: number
  studentCount: number
  createdAt: string
}

export interface CourseMaterial {
  id: number
  courseId: number
  title: string
  originalName: string
  mimeType: string
  sizeBytes: number
  access: 'enrolled' | 'all'
  pageNumber?: number
  downloadLimit?: number
  downloadsUsed?: number
  downloadsRemaining?: number | null
  canDownload?: boolean
  uploadedBy: { id: number; fullName: string } | null
  createdAt: string
}

export interface EnrolledStudent {
  id: number
  username: string
  fullName: string
  email: string
}

interface CoursesState {
  courses: Course[]
  /** Materials keyed by course id — loaded on demand. */
  materialsByCourse: Record<number, CourseMaterial[]>
  enrolmentsByCourse: Record<number, EnrolledStudent[]>
  loading: boolean
  loadingMaterials: boolean
  submitting: boolean
  uploadingCourseId: number | null
  error: string | null
  message: string | null
}

function messageFrom(err: unknown, fallback: string) {
  const axiosErr = err as { response?: { data?: { message?: string } } }
  return axiosErr.response?.data?.message || fallback
}

export const useCoursesStore = defineStore('courses', {
  state: (): CoursesState => ({
    courses: [],
    materialsByCourse: {},
    enrolmentsByCourse: {},
    loading: false,
    loadingMaterials: false,
    submitting: false,
    uploadingCourseId: null,
    error: null,
    message: null,
  }),

  getters: {
    totalMaterials(state): number {
      return state.courses.reduce((sum, course) => sum + course.materialCount, 0)
    },
    subjects(state): string[] {
      return [...new Set(state.courses.map((c) => c.subject).filter(Boolean))].sort()
    },
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const res = await api.get<{ courses: Course[] }>('/courses')
        this.courses = res.data.courses || []
      } catch (err) {
        this.error = messageFrom(err, 'Could not load courses')
        throw err
      } finally {
        this.loading = false
      }
    },

    async create(payload: {
      title: string
      subject?: string
      description?: string
      teacherId?: number | null
    }) {
      this.submitting = true
      this.error = null
      this.message = null
      try {
        const res = await api.post<{ message: string; course: Course }>('/courses', payload)
        this.courses.push(res.data.course)
        this.message = res.data.message
        return res.data.course
      } catch (err) {
        this.error = messageFrom(err, 'Could not create course')
        throw err
      } finally {
        this.submitting = false
      }
    },

    async update(
      id: number,
      payload: Partial<{
        title: string
        subject: string | null
        description: string | null
        teacherId: number | null
        isActive: boolean
      }>,
    ) {
      this.error = null
      this.message = null
      try {
        const res = await api.patch<{ message: string; course: Course }>(`/courses/${id}`, payload)
        const index = this.courses.findIndex((course) => course.id === id)
        if (index >= 0) this.courses[index] = res.data.course
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not update course')
        throw err
      }
    },

    async remove(id: number) {
      this.error = null
      this.message = null
      try {
        const res = await api.delete<{ message: string }>(`/courses/${id}`)
        this.courses = this.courses.filter((course) => course.id !== id)
        delete this.materialsByCourse[id]
        delete this.enrolmentsByCourse[id]
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not delete course')
        throw err
      }
    },

    async fetchMaterials(courseId: number, page = 1) {
      this.loadingMaterials = true
      this.error = null
      try {
        const res = await api.get<{ materials: CourseMaterial[]; downloadLimit?: number }>(
          `/courses/${courseId}/materials`,
          { params: { page } },
        )
        this.materialsByCourse[courseId] = res.data.materials || []
      } catch (err) {
        this.error = messageFrom(err, 'Could not load materials')
        throw err
      } finally {
        this.loadingMaterials = false
      }
    },

    /** Refresh quota fields for one material on a given page without replacing the list. */
    async refreshMaterialQuota(courseId: number, materialId: number, page = 1) {
      try {
        const res = await api.get<{ materials: CourseMaterial[] }>(
          `/courses/${courseId}/materials`,
          { params: { page } },
        )
        const updated = (res.data.materials || []).find((item) => item.id === materialId)
        const bucket = this.materialsByCourse[courseId]
        const row = bucket?.find((item) => item.id === materialId)
        if (updated && row) {
          row.pageNumber = updated.pageNumber
          row.downloadLimit = updated.downloadLimit
          row.downloadsUsed = updated.downloadsUsed
          row.downloadsRemaining = updated.downloadsRemaining
          row.canDownload = updated.canDownload
        }
      } catch (err) {
        this.error = messageFrom(err, 'Could not load download quota')
        throw err
      }
    },

    async uploadMaterial(
      courseId: number,
      file: File,
      options: { title?: string; access?: 'enrolled' | 'all' } = {},
    ) {
      this.uploadingCourseId = courseId
      this.error = null
      this.message = null
      try {
        const body = new FormData()
        body.append('file', file)
        if (options.title) body.append('title', options.title)
        body.append('access', options.access ?? 'enrolled')

        const res = await api.post<{ message: string; material: CourseMaterial }>(
          `/courses/${courseId}/materials`,
          body,
        )

        const bucket = this.materialsByCourse[courseId]
        if (bucket) bucket.unshift(res.data.material)
        else this.materialsByCourse[courseId] = [res.data.material]

        const course = this.courses.find((item) => item.id === courseId)
        if (course) course.materialCount += 1

        this.message = res.data.message
        return res.data.material
      } catch (err) {
        this.error = messageFrom(err, 'Could not upload material')
        throw err
      } finally {
        this.uploadingCourseId = null
      }
    },

    async updateMaterial(
      materialId: number,
      payload: { title?: string; access?: 'enrolled' | 'all'; file?: File },
    ) {
      this.error = null
      this.message = null
      try {
        let res
        if (payload.file) {
          const body = new FormData()
          if (payload.title) body.append('title', payload.title)
          if (payload.access) body.append('access', payload.access)
          body.append('file', payload.file)
          // POST supports multipart file replace more reliably than PATCH.
          res = await api.post<{ message: string; material: CourseMaterial }>(
            `/materials/${materialId}`,
            body,
          )
        } else {
          res = await api.patch<{ message: string; material: CourseMaterial }>(
            `/materials/${materialId}`,
            { title: payload.title, access: payload.access },
          )
        }

        const material = res.data.material
        const bucket = this.materialsByCourse[material.courseId]
        if (bucket) {
          const index = bucket.findIndex((item) => item.id === materialId)
          if (index >= 0) bucket[index] = material
        }
        this.message = res.data.message
        return material
      } catch (err) {
        this.error = messageFrom(err, 'Could not update material')
        throw err
      }
    },

    async deleteMaterial(courseId: number, materialId: number) {
      this.error = null
      this.message = null
      try {
        const res = await api.delete<{ message: string }>(`/materials/${materialId}`)
        const bucket = this.materialsByCourse[courseId]
        if (bucket) {
          this.materialsByCourse[courseId] = bucket.filter((item) => item.id !== materialId)
        }
        const course = this.courses.find((item) => item.id === courseId)
        if (course && course.materialCount > 0) course.materialCount -= 1
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not delete material')
        throw err
      }
    },

    /** In-browser view — does not consume student download quota. */
    async previewMaterial(material: CourseMaterial) {
      this.error = null
      try {
        const res = await api.get<Blob>(`/materials/${material.id}/preview`, {
          responseType: 'blob',
        })
        const mime = material.mimeType || res.data.type || 'application/octet-stream'
        const blob = res.data.type ? res.data : new Blob([res.data], { type: mime })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener')
        // Revoke later so the new tab can finish loading.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } catch (err) {
        this.error = messageFrom(err, 'Could not open that material')
        throw err
      }
    },

    /**
     * Downloads stream through the API so access + student quota are checked.
     * `page` is the material page (default 1); each page has 3 student downloads.
     */
    async downloadMaterial(material: CourseMaterial, page = 1) {
      this.error = null
      try {
        const res = await api.get<Blob>(`/materials/${material.id}/download`, {
          responseType: 'blob',
          params: { page },
        })
        const url = URL.createObjectURL(res.data)
        const link = document.createElement('a')
        link.href = url
        link.download = material.originalName || material.title
        link.click()
        URL.revokeObjectURL(url)

        const bucket = this.materialsByCourse[material.courseId]
        const row = bucket?.find((item) => item.id === material.id)
        if (row && typeof row.downloadsRemaining === 'number') {
          row.downloadsUsed = (row.downloadsUsed ?? 0) + 1
          row.downloadsRemaining = Math.max(0, row.downloadsRemaining - 1)
          row.canDownload = row.downloadsRemaining > 0
        }
      } catch (err) {
        const axiosErr = err as { response?: { data?: Blob | { message?: string } } }
        const data = axiosErr.response?.data
        if (data instanceof Blob) {
          try {
            const body = JSON.parse(await data.text()) as { message?: string }
            this.error = body.message || 'Download limit reached for this page'
          } catch {
            this.error = 'Could not download that material'
          }
        } else {
          this.error = messageFrom(err, 'Could not download that material')
        }
        throw err
      }
    },

    async fetchEnrolments(courseId: number) {
      this.error = null
      try {
        const res = await api.get<{ students: EnrolledStudent[] }>(
          `/courses/${courseId}/enrolments`,
        )
        this.enrolmentsByCourse[courseId] = res.data.students || []
      } catch (err) {
        this.error = messageFrom(err, 'Could not load enrolments')
        throw err
      }
    },

    async updateEnrolments(courseId: number, studentIds: number[]) {
      this.error = null
      this.message = null
      try {
        const res = await api.put<{ message: string; students: EnrolledStudent[] }>(
          `/courses/${courseId}/enrolments`,
          { studentIds },
        )
        this.enrolmentsByCourse[courseId] = res.data.students || []
        const course = this.courses.find((item) => item.id === courseId)
        if (course) course.studentCount = res.data.students.length
        this.message = res.data.message
      } catch (err) {
        this.error = messageFrom(err, 'Could not update enrolments')
        throw err
      }
    },
  },
})
