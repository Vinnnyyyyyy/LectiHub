<template>
  <section class="panel">
    <h2>Share lesson feedback</h2>
    <p>
      After your teacher submits a lesson report, please rate the class and share your learning
      experience.
    </p>

    <p v-if="loading" class="empty">Checking for reports that need feedback...</p>
    <p v-else-if="!pendingReports.length" class="empty">
      You’re all caught up — no pending feedback forms.
    </p>

    <ul v-else class="feedback-list">
      <li v-for="report in pendingReports" :key="report.id">
        <div class="top">
          <strong>{{ report.lessonTopic }}</strong>
          <span class="chip">Feedback needed</span>
        </div>
        <p class="meta">
          {{ formatDate(report.reportDate) }} · {{ report.reportTime }}
          <span v-if="report.teacher"> · {{ report.teacher.fullName }}</span>
        </p>

        <form
          v-if="drafts[report.id]"
          class="form"
          @submit.prevent="submit(report.id)"
        >
          <fieldset>
            <legend>Overall rating</legend>
            <div class="rating-row">
              <label v-for="score in ratingOptions" :key="score" class="rating-option">
                <input
                  v-model.number="drafts[report.id].overallRating"
                  type="radio"
                  :name="`rating-${report.id}`"
                  :value="score"
                  required
                />
                <span>{{ score }}</span>
              </label>
            </div>
          </fieldset>

          <label>
            Comments
            <textarea
              v-model="drafts[report.id].comments"
              rows="3"
              required
              placeholder="What went well? What stood out?"
            />
          </label>

          <label>
            Suggestions
            <textarea
              v-model="drafts[report.id].suggestions"
              rows="2"
              placeholder="Ideas for future lessons (optional)"
            />
          </label>

          <label>
            Learning experience
            <textarea
              v-model="drafts[report.id].learningExperience"
              rows="3"
              required
              placeholder="How did this lesson help your learning?"
            />
          </label>

          <button type="submit" class="submit" :disabled="submittingId === report.id">
            {{ submittingId === report.id ? 'Submitting…' : 'Submit feedback' }}
          </button>
        </form>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { LessonReport } from '../stores/lessonReports'
import type { StudentFeedbackPayload } from '../stores/studentFeedback'

const props = defineProps<{
  reports: LessonReport[]
  loading?: boolean
  submittingId?: number | null
}>()

const emit = defineEmits<{
  submit: [reportId: number, payload: StudentFeedbackPayload]
}>()

type Draft = Required<StudentFeedbackPayload>

const drafts = reactive<Record<number, Draft>>({})
const ratingOptions = [1, 2, 3, 4, 5]

const pendingReports = computed(() => props.reports.filter((report) => !report.hasFeedback))

watch(
  pendingReports,
  (items) => {
    for (const report of items) {
      if (drafts[report.id]) continue
      drafts[report.id] = {
        overallRating: 5,
        comments: '',
        suggestions: '',
        learningExperience: '',
      }
    }
  },
  { immediate: true, deep: true },
)

function submit(reportId: number) {
  const draft = drafts[reportId]
  emit('submit', reportId, {
    overallRating: Number(draft.overallRating),
    comments: draft.comments.trim(),
    suggestions: draft.suggestions.trim(),
    learningExperience: draft.learningExperience.trim(),
  })
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<style scoped>
.panel {
  padding: 1.25rem 1.2rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
}

h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

p,
.empty,
.meta,
strong,
.chip,
label,
legend,
button,
textarea {
  font-family: 'Manrope', sans-serif;
}

p {
  margin-top: 0.35rem;
  color: var(--lh-muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

.empty {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint);
  font-style: italic;
}

.feedback-list {
  list-style: none;
  display: grid;
  gap: 0.85rem;
  margin-top: 0.9rem;
}

.feedback-list li {
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.65);
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.chip {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: 0.4rem;
  color: #fcd34d;
  background: rgba(251, 191, 36, 0.14);
  white-space: nowrap;
}

.meta {
  font-size: 0.86rem;
}

.form {
  display: grid;
  gap: 0.7rem;
  margin-top: 0.75rem;
}

fieldset {
  border: 1px solid var(--lh-line);
  border-radius: 0.55rem;
  padding: 0.55rem 0.65rem 0.7rem;
}

legend,
label {
  color: var(--lh-muted);
  font-size: 0.82rem;
  font-weight: 700;
}

label {
  display: grid;
  gap: 0.3rem;
}

.rating-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.35rem;
}

.rating-option {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.45rem;
  background: rgba(10, 14, 18, 0.65);
  color: var(--lh-ink);
  font-weight: 700;
  cursor: pointer;
}

.rating-option input {
  accent-color: var(--lh-accent);
}

textarea {
  width: 100%;
  border: 1px solid var(--lh-line);
  border-radius: 0.55rem;
  background: rgba(10, 14, 18, 0.75);
  color: var(--lh-ink);
  padding: 0.55rem 0.65rem;
  font-size: 0.9rem;
  font-weight: 500;
  resize: vertical;
  min-height: 3.5rem;
}

.submit {
  border: 0;
  border-radius: 0.55rem;
  padding: 0.55rem 0.95rem;
  background: linear-gradient(135deg, var(--lh-accent), var(--lh-accent-deep));
  color: #041018;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
  justify-self: start;
}

.submit:disabled {
  opacity: 0.65;
  cursor: wait;
}

.submit:hover:not(:disabled) {
  filter: brightness(1.06);
}
</style>
