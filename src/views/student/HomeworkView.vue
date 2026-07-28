<script setup lang="ts">
/**
 * Homework & feedback (student). The reference's screen 03 leads with
 * homework and grades, neither of which has a model behind it. What does
 * exist is the lesson-report side: what a teacher wrote, and the feedback
 * the student owes back.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore } from '../../stores/classes'
import { useLessonReportsStore, type LessonReport } from '../../stores/lessonReports'
import { useStudentFeedbackStore } from '../../stores/studentFeedback'
import { formatDate, formatDateTime } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

type Tab = 'todo' | 'reports' | 'archive'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()

const { loadingHistory } = storeToRefs(classesStore)
const { reports, loading: loadingReports } = storeToRefs(lessonReportsStore)
const {
  feedback,
  loading: loadingFeedback,
  submittingId,
  message,
  error,
} = storeToRefs(studentFeedbackStore)

const tab = ref<Tab>('todo')
const openFormId = ref<number | null>(null)

const draft = reactive({ overallRating: 5, comments: '', learningExperience: '', suggestions: '' })

const awaitingFeedback = computed(() => reports.value.filter((report) => report.needsFeedback))
const answered = computed(() => reports.value.filter((report) => !report.needsFeedback))
const archived = computed(() => classesStore.archived)

const TABS = computed<{ id: Tab; label: string; count: number }[]>(() => [
  { id: 'todo', label: 'Needs your feedback', count: awaitingFeedback.value.length },
  { id: 'reports', label: 'Lesson reports', count: answered.value.length },
  { id: 'archive', label: 'Archived', count: archived.value.length },
])

usePageEyebrow(() =>
  awaitingFeedback.value.length
    ? `${awaitingFeedback.value.length} awaiting your feedback`
    : 'All caught up',
)

function openForm(report: LessonReport) {
  openFormId.value = openFormId.value === report.id ? null : report.id
  draft.overallRating = 5
  draft.comments = ''
  draft.learningExperience = ''
  draft.suggestions = ''
}

function feedbackFor(report: LessonReport) {
  return feedback.value.find((entry) => entry.lessonReportId === report.id) ?? null
}

async function submit(report: LessonReport) {
  if (!draft.comments.trim() || !draft.learningExperience.trim()) return
  try {
    await studentFeedbackStore.submitForReport(report.id, {
      overallRating: draft.overallRating,
      comments: draft.comments.trim(),
      learningExperience: draft.learningExperience.trim(),
      suggestions: draft.suggestions.trim() || undefined,
    })
    openFormId.value = null
    await Promise.allSettled([
      lessonReportsStore.fetchMine(),
      classesStore.fetchMine(),
      classesStore.fetchHistory(),
    ])
  } catch {
    // store surfaces the error
  }
}

onMounted(async () => {
  await Promise.allSettled([
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
    classesStore.fetchHistory(),
  ])
})
</script>

<template>
  <section class="work">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

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

    <!-- Needs feedback -->
    <template v-if="tab === 'todo'">
      <p v-if="loadingReports" class="empty">Loading…</p>
      <p v-else-if="!awaitingFeedback.length" class="empty">
        Nothing waiting on you. Your teachers have everything they need.
      </p>

      <article v-for="report in awaitingFeedback" v-else :key="report.id" class="card">
        <div class="card-head">
          <p class="card-title">{{ report.classSubject || report.lessonTopic || 'Lesson' }}</p>
          <span class="chip warm">Feedback due</span>
        </div>
        <p class="card-sub">
          {{ report.teacher?.fullName ?? 'Your teacher' }} · {{ formatDate(report.reportDate) }}
        </p>
        <p v-if="report.remarks" class="card-body">{{ report.remarks }}</p>
        <p v-if="report.homeworkAssigned" class="homework">
          <span class="homework-label">Homework</span> {{ report.homeworkAssigned }}
        </p>

        <button type="button" class="btn-primary" @click="openForm(report)">
          {{ openFormId === report.id ? 'Cancel' : 'Give feedback' }}
        </button>

        <form v-if="openFormId === report.id" class="form" @submit.prevent="submit(report)">
          <div class="field">
            <label>How was the session?</label>
            <div class="stars" role="radiogroup" aria-label="Overall rating">
              <button
                v-for="score in 5"
                :key="score"
                type="button"
                class="star"
                :class="{ on: draft.overallRating >= score }"
                :aria-label="`${score} out of 5`"
                :aria-pressed="draft.overallRating === score"
                @click="draft.overallRating = score"
              >
                ★
              </button>
            </div>
          </div>

          <div class="field">
            <label :for="`comments-${report.id}`">What went well?</label>
            <textarea
              :id="`comments-${report.id}`"
              v-model="draft.comments"
              rows="3"
              required
              placeholder="What helped, what clicked."
            />
          </div>

          <div class="field">
            <label :for="`learning-${report.id}`">What did you take away?</label>
            <textarea
              :id="`learning-${report.id}`"
              v-model="draft.learningExperience"
              rows="3"
              required
              placeholder="The thing you understand now that you didn't before."
            />
          </div>

          <div class="field">
            <label :for="`suggestions-${report.id}`">Anything you'd change? (optional)</label>
            <textarea
              :id="`suggestions-${report.id}`"
              v-model="draft.suggestions"
              rows="2"
              placeholder="Pacing, materials, timing."
            />
          </div>

          <button
            type="submit"
            class="btn-primary"
            :disabled="submittingId === report.id || !draft.comments || !draft.learningExperience"
          >
            {{ submittingId === report.id ? 'Sending…' : 'Send feedback' }}
          </button>
        </form>
      </article>
    </template>

    <!-- Reports -->
    <template v-else-if="tab === 'reports'">
      <p v-if="loadingReports || loadingFeedback" class="empty">Loading…</p>
      <p v-else-if="!answered.length" class="empty">No lesson reports yet.</p>

      <article v-for="report in answered" v-else :key="report.id" class="card">
        <div class="card-head">
          <p class="card-title">{{ report.classSubject || report.lessonTopic || 'Lesson' }}</p>
          <span v-if="feedbackFor(report)" class="rating">
            {{ feedbackFor(report)?.overallRating?.toFixed(1) }}
          </span>
        </div>
        <p class="card-sub">
          {{ report.teacher?.fullName ?? 'Your teacher' }} · {{ formatDate(report.reportDate) }}
          <template v-if="report.pagesDiscussed"> · pp. {{ report.pagesDiscussed }}</template>
        </p>
        <p v-if="report.remarks" class="card-body">{{ report.remarks }}</p>
        <p v-if="report.studentProgress" class="card-body progress">
          {{ report.studentProgress }}
        </p>
        <p v-if="report.homeworkAssigned" class="homework">
          <span class="homework-label">Homework</span> {{ report.homeworkAssigned }}
        </p>
        <div class="card-foot">
          <p class="foot-item">
            Attendance
            <span class="ink">{{
              report.attendanceStatusLabel || report.attendanceStatus || '—'
            }}</span>
          </p>
          <p v-if="feedbackFor(report)?.submittedAt" class="foot-item">
            You replied
            <span class="ink">{{ formatDateTime(feedbackFor(report)!.submittedAt!) }}</span>
          </p>
        </div>
      </article>
    </template>

    <!-- Archive -->
    <template v-else>
      <p v-if="loadingHistory" class="empty">Loading…</p>
      <p v-else-if="!archived.length" class="empty">Nothing archived yet.</p>

      <div v-else class="table">
        <div class="row head">
          <span>Class</span><span>Teacher</span><span>Date</span><span>Attendance</span>
        </div>
        <div v-for="item in archived" :key="item.id" class="row">
          <span class="strong">{{ item.subject || item.title || 'Class' }}</span>
          <span class="muted">{{ item.teacher?.fullName ?? '—' }}</span>
          <span class="muted">{{ formatDate(item.classDate) }}</span>
          <span class="muted cap">
            {{ item.attendanceStatusLabel || item.attendanceStatus || '—' }}
          </span>
        </div>
      </div>
    </template>

    <p class="footnote">
      Homework tracking and grades from the design need a homework model that does not exist yet.
      What a teacher set is shown on each report above.
    </p>
  </section>
</template>

<style scoped>
.work {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  max-width: 52rem;
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

.tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--lh-line);
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
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
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
}

.chip {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
}

.chip.warm {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.rating {
  margin-left: auto;
  font-size: 14px;
  font-weight: 700;
  color: var(--lh-accent);
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

.homework {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--lh-radius-item);
  background: var(--lh-accent-soft);
  font-size: 12.5px;
  color: var(--lh-ink);
}

.homework-label {
  margin-right: 7px;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-accent);
}

.card-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
}

.foot-item {
  font-size: 11.5px;
  color: var(--lh-muted);
}

.foot-item .ink {
  color: var(--lh-ink);
  font-weight: 700;
  text-transform: capitalize;
}

.btn-primary {
  height: 34px;
  margin-top: 14px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 12.5px;
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

/* Feedback form */

.form {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--lh-line);
  display: flex;
  flex-direction: column;
  gap: 14px;
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

textarea {
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

textarea::placeholder {
  color: var(--lh-ghost);
}

textarea:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.stars {
  display: flex;
  gap: 4px;
}

.star {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--lh-ghost);
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.star.on {
  color: var(--lh-warm);
}

.star:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

/* Archive table */

.table {
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.row {
  display: grid;
  grid-template-columns: 1.6fr 1.2fr 1.2fr 1fr;
  gap: 14px;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
}

.row.head {
  padding: 10px 16px;
  border-top: 0;
  background: var(--lh-bg-elevated);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.strong {
  font-weight: 700;
}

.muted {
  color: var(--lh-muted);
}

.cap {
  text-transform: capitalize;
}

.empty {
  padding: 20px 0;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.footnote {
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid var(--lh-line);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--lh-dim);
}
</style>
