<template>
  <section class="panel">
    <h2>Lesson report</h2>
    <p>
      After class concludes, submit the formal lesson report. It becomes available to the
      administrator and student.
    </p>

    <p v-if="loading" class="empty">Loading completed lessons...</p>
    <p v-else-if="!pendingClasses.length" class="empty">
      No completed lessons waiting for a report.
    </p>

    <ul v-else class="report-list">
      <li v-for="item in pendingClasses" :key="item.id">
        <div class="top">
          <strong>{{ item.title }}</strong>
          <span class="chip">Needs report</span>
        </div>
        <p class="meta">
          {{ formatDate(item.classDate) }}
          ·
          {{ formatTimeRange(item.startTime, item.endTime, item.timeSlot) }}
        </p>
        <p v-if="item.student" class="meta">Student: {{ item.student.fullName }}</p>

        <form
          v-if="drafts[item.id]"
          class="form"
          @submit.prevent="submit(item.id)"
        >
          <div class="row">
            <label>
              Date
              <input v-model="drafts[item.id].reportDate" type="date" required />
            </label>
            <label>
              Time
              <input v-model="drafts[item.id].reportTime" type="time" required />
            </label>
          </div>

          <label>
            Lesson topic
            <input
              v-model="drafts[item.id].lessonTopic"
              type="text"
              required
              placeholder="Main topic covered"
            />
          </label>

          <label>
            Pages discussed
            <input
              v-model="drafts[item.id].pagesDiscussed"
              type="text"
              placeholder="e.g. pp. 42–48"
            />
          </label>

          <label>
            Attendance status
            <select v-model="drafts[item.id].attendanceStatus" required>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="excused">Excused</option>
            </select>
          </label>

          <label>
            Homework assigned
            <textarea
              v-model="drafts[item.id].homeworkAssigned"
              rows="2"
              placeholder="Exercises or reading assigned"
            />
          </label>

          <label>
            Remarks
            <textarea
              v-model="drafts[item.id].remarks"
              rows="2"
              placeholder="Additional notes about the lesson"
            />
          </label>

          <label>
            Student progress
            <textarea
              v-model="drafts[item.id].studentProgress"
              rows="3"
              required
              placeholder="How the student is progressing"
            />
          </label>

          <button type="submit" class="submit" :disabled="submittingId === item.id">
            {{ submittingId === item.id ? 'Submitting…' : 'Submit lesson report' }}
          </button>
        </form>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { ConfirmedSchedule } from '../stores/classes'
import type { LessonReportPayload } from '../stores/lessonReports'

const props = defineProps<{
  completedClasses: ConfirmedSchedule[]
  loading?: boolean
  submittingId?: number | null
}>()

const emit = defineEmits<{
  submit: [classId: number, payload: LessonReportPayload]
}>()

type Draft = Required<LessonReportPayload>

const drafts = reactive<Record<number, Draft>>({})

const pendingClasses = computed(() =>
  props.completedClasses.filter((item) => !item.hasLessonReport),
)

watch(
  pendingClasses,
  (items) => {
    for (const item of items) {
      if (drafts[item.id]) continue
      const attendance =
        item.attendanceStatus && item.attendanceStatus !== 'not_recorded'
          ? item.attendanceStatus
          : 'present'
      drafts[item.id] = {
        reportDate: item.classDate,
        reportTime: (item.startTime || '09:00').slice(0, 5),
        lessonTopic: item.curriculumPlan || item.subject || item.title,
        pagesDiscussed: '',
        attendanceStatus: attendance,
        homeworkAssigned: '',
        remarks: item.participationNotes || '',
        studentProgress: '',
      }
    }
  },
  { immediate: true, deep: true },
)

function submit(classId: number) {
  const draft = drafts[classId]
  emit('submit', classId, {
    reportDate: draft.reportDate,
    reportTime: draft.reportTime,
    lessonTopic: draft.lessonTopic.trim(),
    pagesDiscussed: draft.pagesDiscussed.trim(),
    attendanceStatus: draft.attendanceStatus,
    homeworkAssigned: draft.homeworkAssigned.trim(),
    remarks: draft.remarks.trim(),
    studentProgress: draft.studentProgress.trim(),
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

function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
  timeSlot: string,
) {
  if (startTime && endTime) return `${startTime} – ${endTime}`
  return timeSlot.replace('-', ' – ')
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
button,
input,
textarea,
select {
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

.report-list {
  list-style: none;
  display: grid;
  gap: 0.85rem;
  margin-top: 0.9rem;
}

.report-list li {
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

label {
  display: grid;
  gap: 0.3rem;
  color: var(--lh-muted);
  font-size: 0.82rem;
  font-weight: 700;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid var(--lh-line);
  border-radius: 0.55rem;
  background: rgba(10, 14, 18, 0.75);
  color: var(--lh-ink);
  padding: 0.55rem 0.65rem;
  font-size: 0.9rem;
  font-weight: 500;
}

textarea {
  resize: vertical;
  min-height: 3.5rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
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

@media (max-width: 640px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
