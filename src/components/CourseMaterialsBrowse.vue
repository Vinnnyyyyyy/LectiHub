<script setup lang="ts">
/**
 * Browse course materials for teachers (view-only) and students (view + 3 downloads/page).
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCoursesStore, type Course, type CourseMaterial } from '../stores/courses'
import { formatDate } from '../utils/datetime'
import MaterialPreviewModal from './MaterialPreviewModal.vue'

const props = withDefaults(
  defineProps<{
    /** teacher = view only; student = view + limited downloads */
    mode: 'teacher' | 'student'
  }>(),
  { mode: 'student' },
)

const coursesStore = useCoursesStore()
const { courses, materialsByCourse, loading, loadingMaterials, error, message } =
  storeToRefs(coursesStore)

const selectedId = ref<number | null>(null)
const pageByMaterial = ref<Record<number, number>>({})
const busyId = ref<number | null>(null)

const previewOpen = ref(false)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)
const previewMaterial = ref<CourseMaterial | null>(null)
const previewBlob = ref<Blob | null>(null)

const selected = computed(() => courses.value.find((c) => c.id === selectedId.value) ?? null)
const materials = computed(() =>
  selectedId.value ? (materialsByCourse.value[selectedId.value] ?? []) : [],
)

const hint = computed(() =>
  props.mode === 'teacher'
    ? 'Only courses assigned to you. View opens on screen for discussion — never downloads.'
    : 'Only courses you are enrolled in. View on screen anytime; Download uses the 3/page quota.',
)

function fileSize(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function pageFor(material: CourseMaterial) {
  return pageByMaterial.value[material.id] ?? 1
}

async function openCourse(course: Course) {
  selectedId.value = selectedId.value === course.id ? null : course.id
  if (selectedId.value === null) return
  await coursesStore.fetchMaterials(course.id, 1)
}

async function reloadPage(material: CourseMaterial) {
  if (!selectedId.value) return
  await coursesStore.refreshMaterialQuota(selectedId.value, material.id, pageFor(material))
}

async function viewMaterial(material: CourseMaterial) {
  busyId.value = material.id
  previewMaterial.value = material
  previewBlob.value = null
  previewError.value = null
  previewLoading.value = true
  previewOpen.value = true
  try {
    previewBlob.value = await coursesStore.fetchPreviewBlob(material)
  } catch {
    previewError.value = coursesStore.error || 'Could not open that material'
  } finally {
    previewLoading.value = false
    busyId.value = null
  }
}

function closePreview() {
  previewOpen.value = false
  previewBlob.value = null
  previewMaterial.value = null
  previewError.value = null
  previewLoading.value = false
}

async function downloadMaterial(material: CourseMaterial) {
  if (props.mode !== 'student') return
  busyId.value = material.id
  try {
    await coursesStore.downloadMaterial(material, pageFor(material))
  } catch {
    // store surfaces the error
  } finally {
    busyId.value = null
  }
}

onMounted(async () => {
  await coursesStore.fetchAll()
})
</script>

<template>
  <section class="materials-browse">
    <p class="hint">{{ hint }}</p>
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <p v-if="loading" class="empty">Loading courses…</p>
    <p v-else-if="!courses.length" class="empty">
      {{
        mode === 'student'
          ? 'You are not enrolled in a course yet. Ask admin to assign you.'
          : 'No courses assigned to you yet. Admin assigns teachers to courses.'
      }}
    </p>

    <div v-else class="grid">
      <button
        v-for="course in courses"
        :key="course.id"
        type="button"
        class="card"
        :class="{ active: selectedId === course.id }"
        @click="openCourse(course)"
      >
        <span class="chip">{{ course.subject || 'General' }}</span>
        <span class="card-title">{{ course.title }}</span>
        <span class="card-meta">
          {{ course.materialCount }} material{{ course.materialCount === 1 ? '' : 's' }}
          <template v-if="course.teacher?.fullName"> · {{ course.teacher.fullName }}</template>
        </span>
      </button>
    </div>

    <div v-if="selected" class="detail">
      <div class="detail-head">
        <div>
          <p class="eyebrow">{{ selected.subject || 'General' }}</p>
          <h2>{{ selected.title }}</h2>
        </div>
      </div>

      <p v-if="loadingMaterials" class="empty small">Loading materials…</p>
      <p v-else-if="!materials.length" class="empty small">No materials uploaded for this course yet.</p>

      <ul v-else class="list">
        <li v-for="material in materials" :key="material.id" class="row">
          <div class="info">
            <p class="title">{{ material.title }}</p>
            <p class="meta">
              {{ fileSize(material.sizeBytes) }}
              · {{ formatDate(String(material.createdAt).slice(0, 10)) }}
              <template v-if="mode === 'student'">
                ·
                <span
                  class="quota"
                  :class="{ out: (material.downloadsRemaining ?? 0) <= 0 }"
                >
                  {{ material.downloadsRemaining ?? 0 }}/{{ material.downloadLimit ?? 3 }} downloads
                  left (page {{ pageFor(material) }})
                </span>
              </template>
            </p>
          </div>

          <div class="actions">
            <label v-if="mode === 'student'" class="page-field">
              <span>Page</span>
              <input
                type="number"
                min="1"
                :value="pageFor(material)"
                @change="
                  (e) => {
                    const next = Math.max(1, Number((e.target as HTMLInputElement).value) || 1)
                    pageByMaterial[material.id] = next
                    reloadPage(material)
                  }
                "
              />
            </label>
            <button
              type="button"
              class="btn"
              :disabled="busyId === material.id"
              @click="viewMaterial(material)"
            >
              View
            </button>
            <button
              v-if="mode === 'student'"
              type="button"
              class="btn primary"
              :disabled="busyId === material.id || material.canDownload === false"
              @click="downloadMaterial(material)"
            >
              Download
            </button>
          </div>
        </li>
      </ul>
    </div>

    <MaterialPreviewModal
      :open="previewOpen"
      :material="previewMaterial"
      :blob="previewBlob"
      :loading="previewLoading"
      :error="previewError"
      @close="closePreview"
    />
  </section>
</template>

<style scoped>
.materials-browse {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.hint {
  margin: 0;
  color: var(--lh-muted);
  font-size: 13px;
  line-height: 1.45;
}

.banner {
  margin: 0;
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

.empty {
  margin: 0;
  color: var(--lh-faint);
  font-size: 13px;
}

.empty.small {
  font-size: 12.5px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 14px 12px;
  border: 0;
  border-radius: var(--lh-radius-panel);
  background: color-mix(in srgb, var(--lh-ink) 4%, transparent);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.card:hover,
.card.active {
  background: color-mix(in srgb, var(--lh-accent) 14%, transparent);
}

.chip {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--lh-accent);
}

.card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--lh-ink);
}

.card-meta {
  font-size: 12px;
  color: var(--lh-muted);
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.detail-head .eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.detail-head h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--lh-ink);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-radius: var(--lh-radius-panel);
  background: color-mix(in srgb, var(--lh-ink) 3.5%, transparent);
}

.info {
  min-width: 0;
  flex: 1;
}

.title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--lh-ink);
}

.meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--lh-muted);
}

.quota {
  color: var(--lh-accent);
  font-weight: 600;
}

.quota.out {
  color: var(--lh-danger);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.page-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--lh-muted);
}

.page-field input {
  width: 56px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: color-mix(in srgb, var(--lh-ink) 6%, transparent);
  color: var(--lh-ink);
  font: inherit;
}

.btn {
  height: 31px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: color-mix(in srgb, var(--lh-ink) 8%, transparent);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.btn.primary {
  background: var(--lh-accent);
  color: var(--lh-on-accent);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .row {
    align-items: flex-start;
  }

  .actions {
    width: 100%;
  }
}
</style>
