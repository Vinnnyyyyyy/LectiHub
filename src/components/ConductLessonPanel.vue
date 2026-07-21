<template>
  <section class="panel">
    <h2>Conduct lesson</h2>
    <p>
      Follow the planned curriculum, record attendance and participation, and optionally link a
      session recording.
    </p>

    <p v-if="loading" class="empty">Loading active lessons...</p>
    <p v-else-if="!items.length" class="empty">
      No lessons in progress. Join a scheduled class to begin conducting it.
    </p>

    <ul v-else class="lesson-list">
      <li v-for="item in items" :key="item.id">
        <div class="lesson-top">
          <strong>{{ item.title }}</strong>
          <span class="chip status" data-status="in_progress">In Progress</span>
        </div>
        <p class="meta">
          {{ formatDate(item.classDate) }}
          ·
          {{ formatTimeRange(item.startTime, item.endTime, item.timeSlot) }}
        </p>
        <p v-if="item.student" class="meta">Student: {{ item.student.fullName }}</p>

        <form
          v-if="drafts[item.id]"
          class="conduct-form"
          @submit.prevent="save(item.id, false)"
        >
          <label>
            Curriculum plan
            <textarea
              v-model="drafts[item.id].curriculumPlan"
              rows="3"
              placeholder="Topics and activities for this lesson"
            />
          </label>

          <div class="row">
            <label>
              Attendance
              <select v-model="drafts[item.id].attendanceStatus">
                <option value="not_recorded">Not recorded</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
              </select>
            </label>

            <label>
              Participation
              <select v-model="drafts[item.id].participationLevel">
                <option value="not_recorded">Not recorded</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <label>
            Participation notes
            <textarea
              v-model="drafts[item.id].participationNotes"
              rows="2"
              placeholder="Engagement, questions asked, areas to follow up"
            />
          </label>

          <label>
            Recording link (optional)
            <input
              v-model="drafts[item.id].recordingUrl"
              type="url"
              placeholder="https://…"
              autocomplete="off"
            />
          </label>

          <div class="actions">
            <button type="submit" class="secondary" :disabled="savingId === item.id">
              {{ savingId === item.id ? 'Saving…' : 'Save progress' }}
            </button>
            <button
              type="button"
              class="primary"
              :disabled="savingId === item.id"
              @click="save(item.id, true)"
            >
              {{ savingId === item.id ? 'Saving…' : 'Complete lesson' }}
            </button>
          </div>
        </form>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ConfirmedSchedule, LessonConductPayload } from '../stores/classes'

const props = defineProps<{
  items: ConfirmedSchedule[]
  loading?: boolean
  savingId?: number | null
}>()

const emit = defineEmits<{
  save: [classId: number, payload: LessonConductPayload]
  complete: [classId: number, payload: LessonConductPayload]
}>()

type Draft = Required<LessonConductPayload>

const drafts = reactive<Record<number, Draft>>({})

watch(
  () => props.items,
  (items) => {
    for (const item of items) {
      if (!drafts[item.id]) {
        drafts[item.id] = {
          curriculumPlan: item.curriculumPlan || '',
          attendanceStatus: item.attendanceStatus || 'not_recorded',
          participationLevel: item.participationLevel || 'not_recorded',
          participationNotes: item.participationNotes || '',
          recordingUrl: item.recordingUrl || '',
        }
        continue
      }

      const draft = drafts[item.id]
      if (!draft.curriculumPlan && item.curriculumPlan) {
        draft.curriculumPlan = item.curriculumPlan
      }
      if (draft.attendanceStatus === 'not_recorded' && item.attendanceStatus) {
        draft.attendanceStatus = item.attendanceStatus
      }
      if (draft.participationLevel === 'not_recorded' && item.participationLevel) {
        draft.participationLevel = item.participationLevel
      }
      if (!draft.participationNotes && item.participationNotes) {
        draft.participationNotes = item.participationNotes
      }
      if (!draft.recordingUrl && item.recordingUrl) {
        draft.recordingUrl = item.recordingUrl
      }
    }
  },
  { immediate: true, deep: true },
)

function payloadFor(classId: number): LessonConductPayload {
  const draft = drafts[classId]
  return {
    curriculumPlan: draft.curriculumPlan.trim(),
    attendanceStatus: draft.attendanceStatus,
    participationLevel: draft.participationLevel,
    participationNotes: draft.participationNotes.trim(),
    recordingUrl: draft.recordingUrl.trim(),
  }
}

function save(classId: number, complete: boolean) {
  const payload = payloadFor(classId)
  if (complete) emit('complete', classId, payload)
  else emit('save', classId, payload)
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

.lesson-list {
  list-style: none;
  display: grid;
  gap: 0.85rem;
  margin-top: 0.9rem;
}

.lesson-list li {
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--lh-line);
  border-radius: 0.75rem;
  background: rgba(20, 25, 31, 0.65);
}

.lesson-top {
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
  white-space: nowrap;
  color: #86efac;
  background: rgba(34, 197, 94, 0.14);
}

.meta {
  font-size: 0.86rem;
}

.conduct-form {
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
  min-height: 4rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

button {
  border: 0;
  border-radius: 0.55rem;
  padding: 0.5rem 0.9rem;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
}

button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.secondary {
  background: rgba(148, 163, 184, 0.16);
  color: var(--lh-ink);
  border: 1px solid var(--lh-line);
}

.primary {
  background: linear-gradient(135deg, var(--lh-accent), var(--lh-accent-deep));
  color: #041018;
}

.primary:hover:not(:disabled),
.secondary:hover:not(:disabled) {
  filter: brightness(1.06);
}

@media (max-width: 640px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
