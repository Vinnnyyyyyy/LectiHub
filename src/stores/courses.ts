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

    async fetchMaterials(courseId: number) {
      this.loadingMaterials = true
      this.error = null
      try {
        const res = await api.get<{ materials: CourseMaterial[] }>(`/courses/${courseId}/materials`)
        this.materialsByCourse[courseId] = res.data.materials || []
      } catch (err) {
        this.error = messageFrom(err, 'Could not load materials')
        throw err
      } finally {
        this.loadingMaterials = false
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

    /** Downloads stream through the API so access is checked per request. */
    async downloadMaterial(material: CourseMaterial) {
      this.error = null
      try {
        const res = await api.get<Blob>(`/materials/${material.id}/download`, {
          responseType: 'blob',
        })
        const url = URL.createObjectURL(res.data)
        const link = document.createElement('a')
        link.href = url
        link.download = material.originalName || material.title
        link.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        this.error = messageFrom(err, 'Could not download that material')
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
