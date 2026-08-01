<script setup lang="ts">
/**
 * Courses & materials (admin). Admin creates courses, uploads materials, and
 * manages enrolments. Teachers view online; students view + 3 downloads/page.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCoursesStore, type Course, type CourseMaterial } from '../../stores/courses'
import { useUsersStore } from '../../stores/users'
import { initialsFrom } from '../../utils/initials'
import { formatDate } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

const coursesStore = useCoursesStore()
const usersStore = useUsersStore()

const {
  courses,
  materialsByCourse,
  enrolmentsByCourse,
  loading,
  loadingMaterials,
  submitting,
  uploadingCourseId,
  error,
  message,
} = storeToRefs(coursesStore)
const { users } = storeToRefs(usersStore)

const selectedId = ref<number | null>(null)
const showNewCourse = ref(false)
const subjectFilter = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const replaceFileInput = ref<HTMLInputElement | null>(null)
const uploadAccess = ref<'enrolled' | 'all'>('enrolled')
const editingId = ref<number | null>(null)
const editDraft = ref<{ title: string; access: 'enrolled' | 'all' }>({
  title: '',
  access: 'enrolled',
})
const assignTeacherId = ref<number | ''>('')

const newCourse = ref({ title: '', subject: '', description: '', teacherId: '' as number | '' })

const teachers = computed(() => users.value.filter((user) => user.role === 'teacher'))
const students = computed(() => users.value.filter((user) => user.role === 'student'))

const visible = computed(() =>
  subjectFilter.value
    ? courses.value.filter((course) => course.subject === subjectFilter.value)
    : courses.value,
)

const selected = computed(() => courses.value.find((c) => c.id === selectedId.value) ?? null)
const materials = computed(() =>
  selectedId.value ? (materialsByCourse.value[selectedId.value] ?? []) : [],
)
const roster = computed(() =>
  selectedId.value ? (enrolmentsByCourse.value[selectedId.value] ?? []) : [],
)

usePageEyebrow(() => {
  const c = courses.value.length
  const m = coursesStore.totalMaterials
  return `${c} course${c === 1 ? '' : 's'} · ${m} material${m === 1 ? '' : 's'}`
})

function fileSize(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function openCourse(course: Course) {
  selectedId.value = selectedId.value === course.id ? null : course.id
  editingId.value = null
  if (selectedId.value === null) return
  assignTeacherId.value = course.teacherId ?? ''
  await Promise.allSettled([
    coursesStore.fetchMaterials(course.id),
    coursesStore.fetchEnrolments(course.id),
  ])
}

async function saveTeacherAssignment() {
  if (!selectedId.value) return
  try {
    await coursesStore.update(selectedId.value, {
      teacherId: assignTeacherId.value === '' ? null : Number(assignTeacherId.value),
    })
  } catch {
    // store surfaces the error
  }
}

function startEdit(material: CourseMaterial) {
  editingId.value = material.id
  editDraft.value = { title: material.title, access: material.access }
}

async function saveEdit() {
  if (editingId.value == null) return
  try {
    await coursesStore.updateMaterial(editingId.value, {
      title: editDraft.value.title.trim(),
      access: editDraft.value.access,
    })
    editingId.value = null
  } catch {
    // store surfaces the error
  }
}

async function onReplaceFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || editingId.value == null) return
  try {
    await coursesStore.updateMaterial(editingId.value, {
      title: editDraft.value.title.trim() || undefined,
      access: editDraft.value.access,
      file,
    })
    editingId.value = null
  } catch {
    // store surfaces the error
  } finally {
    input.value = ''
  }
}

async function createCourse() {
  if (!newCourse.value.title.trim()) return
  try {
    const created = await coursesStore.create({
      title: newCourse.value.title.trim(),
      subject: newCourse.value.subject.trim() || undefined,
      description: newCourse.value.description.trim() || undefined,
      teacherId: newCourse.value.teacherId === '' ? null : Number(newCourse.value.teacherId),
    })
    newCourse.value = { title: '', subject: '', description: '', teacherId: '' }
    showNewCourse.value = false
    selectedId.value = created.id
  } catch {
    // store surfaces the error
  }
}

async function removeCourse(course: Course) {
  try {
    await coursesStore.remove(course.id)
    if (selectedId.value === course.id) selectedId.value = null
  } catch {
    // store surfaces the error
  }
}

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !selectedId.value) return
  try {
    await coursesStore.uploadMaterial(selectedId.value, file, { access: uploadAccess.value })
  } catch {
    // store surfaces the error
  } finally {
    input.value = ''
  }
}

async function toggleEnrolment(studentId: number) {
  if (!selectedId.value) return
  const current = roster.value.map((s) => s.id)
  const next = current.includes(studentId)
    ? current.filter((id) => id !== studentId)
    : [...current, studentId]
  try {
    await coursesStore.updateEnrolments(selectedId.value, next)
  } catch {
    // store surfaces the error
  }
}

async function download(material: CourseMaterial) {
  try {
    await coursesStore.downloadMaterial(material)
  } catch {
    // store surfaces the error
  }
}

onMounted(async () => {
  await Promise.allSettled([coursesStore.fetchAll(), usersStore.fetchAll()])
})
</script>

<template>
  <section class="courses">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <div class="toolbar">
      <div class="filters">
        <button
          type="button"
          class="pill"
          :class="{ active: !subjectFilter }"
          @click="subjectFilter = ''"
        >
          All subjects
        </button>
        <button
          v-for="subject in coursesStore.subjects"
          :key="subject"
          type="button"
          class="pill"
          :class="{ active: subjectFilter === subject }"
          @click="subjectFilter = subjectFilter === subject ? '' : subject"
        >
          {{ subject }}
        </button>
      </div>

      <button type="button" class="btn-primary" @click="showNewCourse = !showNewCourse">
        {{ showNewCourse ? 'Close' : 'New course' }}
      </button>
    </div>

    <form v-if="showNewCourse" class="create" @submit.prevent="createCourse">
      <div class="field">
        <label for="c-title">Title</label>
        <input
          id="c-title"
          v-model="newCourse.title"
          type="text"
          required
          placeholder="Algebra II"
        />
      </div>
      <div class="field">
        <label for="c-subject">Subject</label>
        <input id="c-subject" v-model="newCourse.subject" type="text" placeholder="Math" />
      </div>
      <div class="field">
        <label for="c-teacher">Teacher</label>
        <select id="c-teacher" v-model="newCourse.teacherId">
          <option value="">Unassigned</option>
          <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">
            {{ teacher.fullName }}
          </option>
        </select>
      </div>
      <div class="field wide">
        <label for="c-desc">Description</label>
        <input
          id="c-desc"
          v-model="newCourse.description"
          type="text"
          placeholder="Quadratics, functions, sequences."
        />
      </div>
      <button type="submit" class="btn-primary" :disabled="submitting">
        {{ submitting ? 'Creating…' : 'Create course' }}
      </button>
    </form>

    <p v-if="loading" class="empty">Loading courses…</p>
    <p v-else-if="!visible.length" class="empty">
      {{ courses.length ? 'No courses in that subject.' : 'No courses yet. Create the first one.' }}
    </p>

    <div v-else class="grid">
      <button
        v-for="course in visible"
        :key="course.id"
        type="button"
        class="card"
        :class="{ active: selectedId === course.id }"
        @click="openCourse(course)"
      >
        <span class="card-head">
          <span class="chip">{{ course.subject || 'General' }}</span>
          <span class="count">
            {{ course.materialCount }} material{{ course.materialCount === 1 ? '' : 's' }}
          </span>
        </span>
        <span class="card-title">{{ course.title }}</span>
        <span v-if="course.description" class="card-desc">{{ course.description }}</span>
        <span class="card-foot">
          <span class="avatar" aria-hidden="true">
            {{ initialsFrom(course.teacher?.fullName || '—') }}
          </span>
          <span class="foot-text">
            {{ course.teacher?.fullName ?? 'Unassigned' }} · {{ course.studentCount }} student{{
              course.studentCount === 1 ? '' : 's'
            }}
          </span>
        </span>
      </button>
    </div>

    <!-- Detail -->
    <div v-if="selected" class="detail">
      <div class="detail-head">
        <div>
          <p class="eyebrow">{{ selected.subject || 'General' }}</p>
          <h2 class="detail-title">{{ selected.title }}</h2>
        </div>
        <div class="detail-actions">
          <label class="access">
            <span class="access-label">Assign teacher</span>
            <select v-model="assignTeacherId" @change="saveTeacherAssignment">
              <option value="">Unassigned</option>
              <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">
                {{ teacher.fullName }}
              </option>
            </select>
          </label>
          <label class="access">
            <span class="access-label">Upload access</span>
            <select v-model="uploadAccess">
              <option value="enrolled">Enrolled students</option>
              <option value="all">All enrolled (labelled)</option>
            </select>
          </label>
          <input ref="fileInput" type="file" class="sr-only" @change="onFilePicked" />
          <input ref="replaceFileInput" type="file" class="sr-only" @change="onReplaceFile" />
          <button
            type="button"
            class="btn-primary"
            :disabled="uploadingCourseId === selected.id"
            @click="fileInput?.click()"
          >
            {{ uploadingCourseId === selected.id ? 'Uploading…' : 'Upload material' }}
          </button>
          <button type="button" class="btn-danger" @click="removeCourse(selected)">Delete</button>
        </div>
      </div>

      <div class="detail-split">
        <div class="col">
          <p class="col-label">Materials</p>

          <p v-if="loadingMaterials" class="empty small">Loading…</p>
          <p v-else-if="!materials.length" class="empty small">
            Nothing uploaded yet. Assigned teachers can view for discussion;
            enrolled students get 3 downloads per page.
          </p>

          <div v-else class="table">
            <div class="row head">
              <span>Material</span><span>Size</span><span>Uploaded</span><span>Access</span>
              <span class="col-action" />
            </div>
            <div v-for="material in materials" :key="material.id" class="row">
              <template v-if="editingId === material.id">
                <span class="edit-fields">
                  <input v-model="editDraft.title" type="text" aria-label="Material title" />
                  <select v-model="editDraft.access" aria-label="Material access">
                    <option value="enrolled">Enrolled students</option>
                    <option value="all">All enrolled (labelled)</option>
                  </select>
                </span>
                <span class="muted">{{ fileSize(material.sizeBytes) }}</span>
                <span class="muted">{{ formatDate(String(material.createdAt).slice(0, 10)) }}</span>
                <span class="muted">Editing</span>
                <span class="col-action">
                  <button type="button" class="btn-mini" @click="saveEdit">Save</button>
                  <button type="button" class="btn-mini ghost" @click="replaceFileInput?.click()">
                    Replace file
                  </button>
                  <button type="button" class="btn-mini ghost" @click="editingId = null">
                    Cancel
                  </button>
                </span>
              </template>
              <template v-else>
                <span class="strong">{{ material.title }}</span>
                <span class="muted">{{ fileSize(material.sizeBytes) }}</span>
                <span class="muted">{{ formatDate(String(material.createdAt).slice(0, 10)) }}</span>
                <span>
                  <span class="tag" :class="material.access === 'all' ? 'accent' : 'neutral'">
                    {{ material.access === 'all' ? 'All enrolled' : 'Enrolled' }}
                  </span>
                </span>
                <span class="col-action">
                  <button type="button" class="btn-mini" @click="download(material)">Get</button>
                  <button type="button" class="btn-mini ghost" @click="startEdit(material)">
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn-mini ghost"
                    @click="coursesStore.deleteMaterial(selected!.id, material.id)"
                  >
                    Remove
                  </button>
                </span>
              </template>
            </div>
          </div>
        </div>

        <aside class="col roster">
          <p class="col-label">Assign students · {{ roster.length }}</p>
          <p class="col-note">Only assigned (enrolled) students can view and download materials.</p>

          <p v-if="!students.length" class="empty small">No students on the roll yet.</p>

          <div v-else class="rosterlist">
            <label v-for="student in students" :key="student.id" class="rosterrow">
              <input
                type="checkbox"
                :checked="roster.some((s) => s.id === student.id)"
                @change="toggleEnrolment(student.id)"
              />
              <span class="avatar small" aria-hidden="true">
                {{ initialsFrom(student.fullName) }}
              </span>
              <span class="rostername">{{ student.fullName }}</span>
            </label>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.courses {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.banner {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 12.5px;
}

.banner.error {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.filters {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.pill {
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.pill.active {
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  color: var(--lh-ink);
  font-weight: 700;
}

.btn-primary,
.btn-danger {
  height: 31px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--lh-radius-control);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.btn-primary {
  margin-left: auto;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
}

.btn-primary:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-danger-soft);
  color: var(--lh-danger);
}

.pill:focus-visible,
.btn-primary:focus-visible,
.btn-danger:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

/* Create form */

.create {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 12px;
  align-items: end;
  padding: 16px 18px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field.wide {
  grid-column: span 3;
}

.field label,
.access-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.field input,
.field select,
.access select {
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
}

.field input:focus,
.field select:focus,
.access select:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.create .btn-primary {
  margin-left: 0;
  height: 34px;
}

/* Cards */

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
  border: 0;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: box-shadow var(--lh-ease);
}

.card:hover {
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
}

.card.active {
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  background: color-mix(in srgb, var(--lh-accent) 6%, var(--lh-rail));
}

.card:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.chip {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 10.5px;
  font-weight: 700;
}

.count {
  font-size: 11.5px;
  color: var(--lh-dim);
}

.card-title {
  margin-top: 14px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.card-desc {
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--lh-muted);
}

.card-foot {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 16px;
}

.avatar {
  flex: 0 0 22px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-size: 9.5px;
  font-weight: 800;
}

.avatar.small {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  font-size: 9px;
}

.foot-text {
  font-size: 12px;
  color: var(--lh-muted);
}

/* Detail */

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--lh-line);
}

.detail-head {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.eyebrow,
.col-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.detail-title {
  margin-top: 7px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1;
}

.detail-actions {
  margin-left: auto;
  display: flex;
  align-items: flex-end;
  gap: 9px;
}

.access {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-actions .btn-primary {
  margin-left: 0;
  height: 34px;
}

.detail-actions .btn-danger {
  height: 34px;
}

.detail-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 20px;
  align-items: start;
}

.col {
  min-width: 0;
}

.col-note {
  margin-top: 5px;
  font-size: 11px;
  color: var(--lh-dim);
}

.table {
  margin-top: 10px;
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.row {
  display: grid;
  grid-template-columns: 2fr 0.7fr 1fr 1.1fr auto;
  gap: 14px;
  align-items: center;
  padding: 11px 16px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
}

.row.head {
  padding: 9px 16px;
  border-top: 0;
  background: var(--lh-bg-elevated);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.col-action {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  width: 7.5rem;
}

.strong {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.edit-fields input,
.edit-fields select {
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: color-mix(in srgb, var(--lh-ink) 6%, transparent);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
}

.muted {
  color: var(--lh-muted);
}

.tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
}

.tag.accent {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.tag.neutral {
  background: var(--lh-chip);
  color: var(--lh-faint);
}

.btn-mini {
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.btn-mini.ghost {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-faint);
}

.btn-mini.ghost:hover {
  color: var(--lh-danger);
}

.btn-mini:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

/* Roster */

.rosterlist {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  max-height: 22rem;
  overflow-y: auto;
}

.rosterrow {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 0;
  border-bottom: 1px solid var(--lh-line);
  font-size: 12.5px;
  cursor: pointer;
}

.rosterrow input {
  width: 15px;
  height: 15px;
  accent-color: var(--lh-accent);
}

.rostername {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  padding: 20px 0;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.empty.small {
  padding: 12px 0 0;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-split {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .grid,
  .create {
    grid-template-columns: 1fr;
  }

  .field.wide {
    grid-column: span 1;
  }
}
</style>
