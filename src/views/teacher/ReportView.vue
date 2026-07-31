<script setup lang="ts">
/**
 * Lesson report (teacher 03) — file the report for a completed class.
 * Session details carry over from the class; the teacher writes the prose.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useClassesStore, type ConfirmedSchedule } from '../../stores/classes'
import { useLessonReportsStore, type LessonReportPayload } from '../../stores/lessonReports'
import { initialsFrom } from '../../utils/initials'
import { formatDate, formatDateTime } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const router = useRouter()

const { submittingId, message, error } = storeToRefs(lessonReportsStore)
const { reports } = storeToRefs(lessonReportsStore)

const selectedId = ref<number | null>(null)

/** Completed classes with no report yet — what this screen is for. */
const awaiting = computed(() => {
  const filed = new Set(reports.value.map((report) => report.classId))
  return classesStore.past.filter((item) => !filed.has(item.id))
})

const active = computed(
  () => awaiting.value.find((item) => item.id === selectedId.value) ?? awaiting.value[0] ?? null,
)

const draft = reactive({
  lessonTopic: '',
  pagesDiscussed: '',
  remarks: '',
  studentProgress: '',
  homeworkAssigned: '',
})

watch(
  active,
  (item) => {
    draft.lessonTopic = item?.curriculumPlan ?? ''
    draft.pagesDiscussed = ''
    draft.remarks = ''
    draft.studentProgress = ''
    draft.homeworkAssigned = ''
  },
  { immediate: true },
)

usePageEyebrow(() =>
  awaiting.value.length
    ? `${awaiting.value.length} report${awaiting.value.length === 1 ? '' : 's'} to file`
    : 'Nothing to file',
)

/** The last report for this student, to write against. */
const previousReport = computed(() => {
  const studentId = active.value?.studentId
  if (!studentId) return null
  return (
    reports.value
      .filter((report) => report.studentId === studentId)
      .sort((a, b) => ((a.submittedAt ?? '') < (b.submittedAt ?? '') ? 1 : -1))[0] ?? null
  )
})

function sessionRecord(item: ConfirmedSchedule) {
  return [
    {
      label: 'Attendance',
      value: item.attendanceStatusLabel || item.attendanceStatus || 'Not recorded',
    },
    {
      label: 'Participation',
      value: item.participationLevelLabel || item.participationLevel || 'Not recorded',
    },
    { label: 'Duration', value: `${item.durationMinutes || 30} min` },
    { label: 'Recording', value: item.recordingUrl ? 'Attached' : 'None' },
  ]
}

const canPublish = computed(
  () => !!active.value && !!draft.lessonTopic.trim() && !!draft.studentProgress.trim(),
)

async function publish() {
  if (!active.value || !canPublish.value) return

  const payload: LessonReportPayload = {
    reportDate: active.value.classDate,
    reportTime: active.value.timeSlot.split('-')[0] ?? '',
    lessonTopic: draft.lessonTopic.trim(),
    pagesDiscussed: draft.pagesDiscussed.trim() || undefined,
    attendanceStatus: active.value.attendanceStatus || 'present',
    homeworkAssigned: draft.homeworkAssigned.trim() || undefined,
    remarks: draft.remarks.trim() || undefined,
    studentProgress: draft.studentProgress.trim(),
  }

  try {
    await lessonReportsStore.submitForClass(active.value.id, payload)
    await Promise.allSettled([classesStore.fetchMine(), classesStore.fetchHistory()])
    if (!awaiting.value.length) await router.push('/teacher/records')
  } catch {
    // store surfaces the error
  }
}

onMounted(async () => {
  if (!classesStore.schedules.length) await classesStore.fetchMine()
  if (!reports.value.length) await lessonReportsStore.fetchMine()
})
</script>

<template>
  <section class="report">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <div v-if="!active" class="empty-state">
      <p class="empty-title">Nothing to file</p>
      <p class="empty-copy">Every completed class has a report. Nicely done.</p>
      <RouterLink class="empty-link" to="/teacher/records">View records</RouterLink>
    </div>

    <template v-else>
      <div v-if="awaiting.length > 1" class="switcher">
        <button
          v-for="item in awaiting"
          :key="item.id"
          type="button"
          class="switch"
          :class="{ active: item.id === active.id }"
          @click="selectedId = item.id"
        >
          {{ item.student?.fullName ?? 'Student' }} · {{ formatDate(item.classDate) }}
        </button>
      </div>

      <div class="split">
        <div class="col">
          <div class="card header-card">
            <span class="avatar" aria-hidden="true">
              {{ initialsFrom(active.student?.fullName || 'Student') }}
            </span>
            <div class="header-copy">
              <p class="header-name">
                {{ active.student?.fullName ?? 'Student' }} ·
                {{ active.subject || active.title || 'Class' }}
              </p>
              <p class="header-meta">
                {{ formatDate(active.classDate) }}, {{ active.timeSlot.replace('-', ' – ') }} ·
                completed
              </p>
            </div>
            <span class="chip">
              {{ active.attendanceStatusLabel || active.attendanceStatus || 'Not recorded' }}
            </span>
          </div>

          <div class="card">
            <label class="card-label" for="topic">What we covered</label>
            <textarea
              id="topic"
              v-model="draft.lessonTopic"
              rows="4"
              placeholder="The topic, what you worked through, how it went."
            />
          </div>

          <div class="card">
            <label class="card-label" for="progress">Where they're strong / where to push</label>
            <textarea
              id="progress"
              v-model="draft.studentProgress"
              rows="4"
              placeholder="What's solid, and the one thing worth drilling next time."
            />
          </div>

          <div class="card">
            <p class="card-label">Homework set</p>
            <div class="pair">
              <input
                v-model="draft.homeworkAssigned"
                type="text"
                placeholder="Worksheet 4 · problems 1–6"
              />
              <input v-model="draft.pagesDiscussed" type="text" placeholder="Pages 88 – 94" />
            </div>
            <textarea
              v-model="draft.remarks"
              rows="3"
              placeholder="Anything else the student or admin should see."
            />
          </div>

          <div class="actions">
            <button
              type="button"
              class="btn-primary"
              :disabled="!canPublish || submittingId === active.id"
              @click="publish"
            >
              {{
                submittingId === active.id
                  ? 'Publishing…'
                  : `Publish to ${active.student?.fullName?.split(' ')[0] ?? 'student'} & admin`
              }}
            </button>
            <p v-if="!canPublish" class="actions-note">
              What we covered and the progress note are both required.
            </p>
          </div>
        </div>

        <aside class="col side">
          <div class="card">
            <p class="card-label">Session record</p>
            <div v-for="fact in sessionRecord(active)" :key="fact.label" class="factline">
              <p class="fact-label">{{ fact.label }}</p>
              <p class="fact-value">{{ fact.value }}</p>
            </div>
            <p class="card-note">Carried over from the session.</p>
          </div>

          <div v-if="previousReport" class="card">
            <p class="card-label">
              Previous report ·
              {{ previousReport.submittedAt ? formatDateTime(previousReport.submittedAt) : '' }}
            </p>
            <p class="prev-body">
              {{ previousReport.remarks || previousReport.lessonTopic || 'No notes recorded.' }}
            </p>
          </div>

          <div class="card publish-note">
            <p class="card-label">On publish</p>
            <ul class="bullets">
              <li>
                {{ active.student?.fullName?.split(' ')[0] ?? 'The student' }} and the admin are
                notified
              </li>
              <li>They're asked for feedback on the lesson</li>
              <li>The class archives once feedback arrives</li>
            </ul>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.report {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
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

.empty-state {
  padding: 44px 24px;
  border-radius: var(--lh-radius-panel);
  box-shadow: inset 0 0 0 1px var(--lh-line);
  text-align: center;
}

.empty-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  font-weight: 500;
}

.empty-copy {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.empty-link {
  display: inline-block;
  margin-top: 14px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--lh-accent);
  text-decoration: none;
}

.switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.switch {
  height: 29px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.switch.active {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
}

.switch:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.split {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 24px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.card {
  padding: 18px 20px;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.header-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-size: 11.5px;
  font-weight: 800;
}

.header-copy {
  flex: 1;
  min-width: 0;
}

.header-name {
  font-size: 14.5px;
  font-weight: 700;
}

.header-meta {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

.chip {
  flex: 0 0 auto;
  padding: 3px 9px;
  border-radius: 5px;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 10.5px;
  font-weight: 700;
  text-transform: capitalize;
}

.card-label {
  display: block;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.card-note {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

textarea,
input {
  width: 100%;
  margin-top: 12px;
  padding: 11px 12px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.55;
  resize: vertical;
}

input {
  height: 38px;
  padding: 0 12px;
}

textarea::placeholder,
input::placeholder {
  color: var(--lh-ghost);
}

textarea:focus,
input:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.pair {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 10px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-primary {
  height: 44px;
  border: 0;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.btn-primary:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent-hover);
}

.actions-note {
  font-size: 11.5px;
  color: var(--lh-dim);
  text-align: center;
}

.factline {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--lh-line);
}

.factline:first-of-type {
  margin-top: 12px;
  border-top: 1px solid var(--lh-line);
}

.fact-label {
  font-size: 11.5px;
  color: var(--lh-dim);
}

.fact-value {
  font-size: 12.5px;
  font-weight: 600;
  text-transform: capitalize;
}

.prev-body {
  margin-top: 10px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lh-muted);
  text-wrap: pretty;
}

.bullets {
  margin-top: 12px;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--lh-muted);
}

@media (max-width: 1000px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
