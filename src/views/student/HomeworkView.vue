<script setup lang="ts">
/**
 * Homework & grades (student 03). To do / submitted / graded over a term
 * average, with lesson reports and course materials alongside.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useHomeworkStore, type HomeworkItem } from '../../stores/homework'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useCoursesStore } from '../../stores/courses'
import { formatDate, formatDateTime } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

type Tab = 'todo' | 'submitted' | 'graded' | 'reports'

const homeworkStore = useHomeworkStore()
const lessonReportsStore = useLessonReportsStore()
const coursesStore = useCoursesStore()

const { summary, loading, submittingId, error, message } = storeToRefs(homeworkStore)
const { reports } = storeToRefs(lessonReportsStore)
const { courses } = storeToRefs(coursesStore)

const tab = ref<Tab>('todo')
const openId = ref<number | null>(null)
const draft = reactive<{ body: string; file: File | null }>({ body: '', file: null })

const TABS = computed<{ id: Tab; label: string; count: number }[]>(() => [
  { id: 'todo', label: 'To do', count: summary.value.pending },
  { id: 'submitted', label: 'Submitted', count: summary.value.submitted },
  { id: 'graded', label: 'Graded', count: summary.value.graded },
  { id: 'reports', label: 'Lesson reports', count: reports.value.length },
])

const visible = computed<HomeworkItem[]>(() => {
  if (tab.value === 'submitted') return homeworkStore.submitted
  if (tab.value === 'graded') return homeworkStore.graded
  return homeworkStore.pending
})

usePageEyebrow(() => {
  const due = summary.value.pending
  return due ? `${due} to do` : 'Nothing due'
})

/** Days until due — negative means overdue. */
function daysUntil(dueAt: string | null) {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const target = new Date(due)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - start.getTime()) / 86400000)
}

function dueLabel(item: HomeworkItem) {
  const days = daysUntil(item.dueAt)
  if (days === null) return 'No due date'
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

function dueTone(item: HomeworkItem) {
  const days = daysUntil(item.dueAt)
  if (days === null) return 'dim'
  if (days < 0) return 'danger'
  if (days <= 2) return 'warm'
  return 'accent'
}

function scorePercent(item: HomeworkItem) {
  const score = item.submission?.score
  if (score == null) return null
  return Math.round((score / Math.max(1, item.maxScore)) * 100)
}

function openSubmit(item: HomeworkItem) {
  openId.value = openId.value === item.id ? null : item.id
  draft.body = item.submission?.body ?? ''
  draft.file = null
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  draft.file = input.files?.[0] ?? null
}

async function submit(item: HomeworkItem) {
  if (!draft.body.trim() && !draft.file) return
  try {
    await homeworkStore.submit(item.id, { body: draft.body.trim(), file: draft.file })
    openId.value = null
    draft.body = ''
    draft.file = null
  } catch {
    // store surfaces the error
  }
}

onMounted(async () => {
  await Promise.allSettled([
    homeworkStore.fetchMine(),
    lessonReportsStore.fetchMine(),
    coursesStore.fetchAll(),
  ])
})
</script>

<template>
  <section class="work">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <div class="split">
      <div class="main">
        <nav class="tabs" aria-label="Coursework">
          <button
            v-for="item in TABS"
            :key="item.id"
            type="button"
            class="tab"
            :class="{ active: tab === item.id }"
            :aria-current="tab === item.id ? 'true' : undefined"
            @click="tab = item.id"
          >
            {{ item.label }}
            <span v-if="item.count" class="count">{{ item.count }}</span>
          </button>
        </nav>

        <!-- Homework -->
        <template v-if="tab !== 'reports'">
          <p v-if="loading" class="empty">Loading…</p>
          <p v-else-if="!visible.length" class="empty">
            {{
              tab === 'todo'
                ? 'Nothing to do. Your teachers will set work after your next lesson.'
                : tab === 'submitted'
                  ? 'Nothing waiting to be marked.'
                  : 'Nothing graded yet.'
            }}
          </p>

          <article v-for="item in visible" v-else :key="item.id" class="card">
            <div class="card-head">
              <p class="card-title">{{ item.title }}</p>
              <span v-if="item.status === 'graded'" class="score">
                {{ scorePercent(item) }}<span class="score-max">/100</span>
              </span>
              <span v-else class="chip" :class="dueTone(item)">{{ dueLabel(item) }}</span>
            </div>

            <p class="card-sub">
              Set by {{ item.teacher?.fullName ?? 'your teacher' }}
              <template v-if="item.course"> · {{ item.course.title }}</template>
              <template v-if="item.dueAt"> · due {{ formatDateTime(item.dueAt) }}</template>
            </p>

            <p v-if="item.instructions" class="card-body">{{ item.instructions }}</p>

            <!-- Graded -->
            <div v-if="item.status === 'graded'" class="graded">
              <p class="graded-line">
                <span class="graded-score">{{ item.submission?.score }}</span>
                <span class="graded-of">out of {{ item.maxScore }}</span>
                <span class="graded-when">
                  Graded
                  {{
                    item.submission?.gradedAt
                      ? formatDate(String(item.submission.gradedAt).slice(0, 10))
                      : ''
                  }}
                </span>
              </p>
              <p v-if="item.submission?.feedback" class="feedback">
                “{{ item.submission.feedback }}”
              </p>
            </div>

            <!-- Submitted, awaiting marking -->
            <div v-else-if="item.status === 'submitted'" class="awaiting">
              <p class="awaiting-text">
                Handed in
                {{
                  item.submission?.submittedAt ? formatDateTime(item.submission.submittedAt) : ''
                }}. Waiting to be marked.
              </p>
              <button
                v-if="item.submission?.hasFile"
                type="button"
                class="btn-ghost"
                @click="homeworkStore.downloadSubmission(item)"
              >
                {{ item.submission.fileName }}
              </button>
            </div>

            <!-- To do -->
            <template v-else>
              <button type="button" class="btn-primary" @click="openSubmit(item)">
                {{ openId === item.id ? 'Cancel' : 'Upload your work' }}
              </button>

              <form v-if="openId === item.id" class="form" @submit.prevent="submit(item)">
                <div class="field">
                  <label :for="`body-${item.id}`">Notes for your teacher</label>
                  <textarea
                    :id="`body-${item.id}`"
                    v-model="draft.body"
                    rows="3"
                    placeholder="Anything you got stuck on."
                  />
                </div>

                <div class="field">
                  <label :for="`file-${item.id}`">Attach a file</label>
                  <input :id="`file-${item.id}`" type="file" @change="onFile" />
                  <p class="hint">Optional if you've written notes above.</p>
                </div>

                <button
                  type="submit"
                  class="btn-primary"
                  :disabled="submittingId === item.id || (!draft.body.trim() && !draft.file)"
                >
                  {{ submittingId === item.id ? 'Sending…' : 'Hand it in' }}
                </button>
              </form>
            </template>
          </article>
        </template>

        <!-- Lesson reports -->
        <template v-else>
          <p v-if="!reports.length" class="empty">No lesson reports yet.</p>

          <article v-for="report in reports" v-else :key="report.id" class="card">
            <div class="card-head">
              <p class="card-title">{{ report.classSubject || report.lessonTopic || 'Lesson' }}</p>
              <span class="chip dim">{{ formatDate(report.reportDate) }}</span>
            </div>
            <p class="card-sub">{{ report.teacher?.fullName ?? 'Your teacher' }}</p>
            <p v-if="report.remarks" class="card-body">{{ report.remarks }}</p>
            <p v-if="report.studentProgress" class="card-body progress">
              {{ report.studentProgress }}
            </p>
          </article>
        </template>
      </div>

      <!-- Side -->
      <aside class="side">
        <div class="average">
          <p class="eyebrow">Term average</p>
          <p class="average-value">
            {{ summary.average == null ? '—' : Math.round(summary.average) }}
          </p>
          <p class="average-note">
            {{
              summary.graded
                ? `Across ${summary.graded} graded piece${summary.graded === 1 ? '' : 's'}`
                : 'Nothing graded yet'
            }}
          </p>
        </div>

        <div class="panel">
          <p class="eyebrow">Recently graded</p>
          <p v-if="!homeworkStore.graded.length" class="empty small">Nothing graded yet.</p>
          <div v-for="item in homeworkStore.graded.slice(0, 5)" v-else :key="item.id" class="grow">
            <span class="grow-score">{{ scorePercent(item) }}</span>
            <span class="grow-copy">
              <span class="grow-title">{{ item.title }}</span>
              <span class="grow-when">
                {{
                  item.submission?.gradedAt
                    ? formatDate(String(item.submission.gradedAt).slice(0, 10))
                    : ''
                }}
              </span>
            </span>
          </div>
        </div>

        <div class="panel">
          <p class="eyebrow">Course materials</p>
          <p v-if="!courses.length" class="empty small">You're not enrolled in a course yet.</p>
          <div v-else>
            <div v-for="course in courses" :key="course.id" class="crow">
              <span class="crow-title">{{ course.title }}</span>
              <span class="crow-count">
                {{ course.materialCount }} item{{ course.materialCount === 1 ? '' : 's' }}
              </span>
            </div>
          </div>
          <p class="panel-note">
            Open <strong>Course materials</strong> in the sidebar to view online or
            download (3 chances per page).
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.work {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 26px;
  align-items: start;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--lh-line);
  flex-wrap: wrap;
}

.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 0 11px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.tab:hover {
  color: var(--lh-ink);
}

.tab.active {
  border-bottom-color: var(--lh-accent);
  color: var(--lh-accent);
  font-weight: 700;
}

.count {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  font-size: 10px;
  font-weight: 800;
}

.tab.active .count {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.tab:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.card {
  padding: 16px 18px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.card-title {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 18px;
  font-weight: 500;
  letter-spacing: -0.02em;
  min-width: 0;
}

.chip {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
}

.chip.accent {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.chip.warm {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.chip.danger {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.chip.dim {
  background: var(--lh-chip);
  color: var(--lh-faint);
}

.score {
  margin-left: auto;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 24px;
  line-height: 1;
  color: var(--lh-accent);
}

.score-max {
  font-size: 12px;
  color: var(--lh-faint);
}

.card-sub {
  margin-top: 5px;
  font-size: 12px;
  color: var(--lh-faint);
}

.card-body {
  margin-top: 11px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--lh-muted);
  text-wrap: pretty;
}

.card-body.progress {
  margin-top: 7px;
  color: var(--lh-faint);
}

.graded {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--lh-line);
}

.graded-line {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.graded-score {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  color: var(--lh-accent);
}

.graded-of,
.graded-when {
  font-size: 11.5px;
  color: var(--lh-dim);
}

.graded-when {
  margin-left: auto;
}

.feedback {
  margin-top: 9px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lh-muted);
  font-style: italic;
}

.awaiting {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--lh-line);
  flex-wrap: wrap;
}

.awaiting-text {
  font-size: 12px;
  color: var(--lh-muted);
}

.btn-primary,
.btn-ghost {
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--lh-radius-control);
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.btn-primary {
  margin-top: 14px;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
}

.btn-primary:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ghost {
  margin-left: auto;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-accent);
  font-weight: 700;
}

.btn-primary:focus-visible,
.btn-ghost:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.form {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--lh-line);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form .btn-primary {
  margin-top: 0;
  align-self: flex-start;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

textarea,
input[type='file'] {
  padding: 11px 12px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.55;
}

textarea {
  resize: vertical;
}

textarea::placeholder {
  color: var(--lh-ghost);
}

textarea:focus,
input[type='file']:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.hint {
  font-size: 11px;
  color: var(--lh-dim);
}

/* Side */

.side {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.average {
  padding: 18px 20px;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.average-value {
  margin-top: 10px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 40px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--lh-accent);
}

.average-note {
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--lh-muted);
}

.grow {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 0;
  border-bottom: 1px solid var(--lh-line);
}

.grow:first-of-type {
  margin-top: 8px;
  border-top: 1px solid var(--lh-line);
}

.grow-score {
  flex: 0 0 2.2rem;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 18px;
  color: var(--lh-accent);
}

.grow-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grow-title {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grow-when {
  font-size: 11px;
  color: var(--lh-dim);
}

.crow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--lh-line);
  color: inherit;
  text-decoration: none;
}

.crow:first-of-type {
  margin-top: 8px;
  border-top: 1px solid var(--lh-line);
}

.crow-title {
  font-size: 12.5px;
  font-weight: 600;
}

.crow-count {
  font-size: 11px;
  color: var(--lh-dim);
}

.panel-note {
  margin-top: 9px;
  font-size: 11px;
  color: var(--lh-dim);
}

.empty {
  padding: 20px 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--lh-muted);
}

.empty.small {
  margin-top: 8px;
  padding: 0;
  font-size: 12px;
}

@media (max-width: 1000px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
