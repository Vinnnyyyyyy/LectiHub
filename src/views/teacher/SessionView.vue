<script setup lang="ts">
/**
 * In session (teacher 02) — one class in focus. Attendance, participation and
 * curriculum are recorded here; the report itself lives on /teacher/report.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useClassesStore, type LessonConductPayload } from '../../stores/classes'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { initialsFrom } from '../../utils/initials'
import { formatDate, formatDateTime } from '../../utils/datetime'
import { usePageEyebrow, usePageTitle } from '../../composables/usePageMeta'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const router = useRouter()

const { savingId, conductMessage, error: classError } = storeToRefs(classesStore)
const { reports } = storeToRefs(lessonReportsStore)

const ATTENDANCE = ['present', 'late', 'absent', 'excused']
const PARTICIPATION = ['low', 'medium', 'high']

const inProgress = computed(() => classesStore.inProgress)
const selectedId = ref<number | null>(null)

const active = computed(
  () =>
    inProgress.value.find((item) => item.id === selectedId.value) ?? inProgress.value[0] ?? null,
)

const draft = reactive<Required<LessonConductPayload>>({
  curriculumPlan: '',
  attendanceStatus: '',
  participationLevel: '',
  participationNotes: '',
  recordingUrl: '',
})

watch(
  active,
  (item) => {
    draft.curriculumPlan = item?.curriculumPlan ?? ''
    draft.attendanceStatus =
      item?.attendanceStatus === 'not_recorded' ? '' : (item?.attendanceStatus ?? '')
    draft.participationLevel =
      item?.participationLevel === 'not_recorded' ? '' : (item?.participationLevel ?? '')
    draft.participationNotes = item?.participationNotes ?? ''
    draft.recordingUrl = item?.recordingUrl ?? ''
  },
  { immediate: true },
)

usePageTitle(() => active.value?.subject || active.value?.title || 'In session')
usePageEyebrow(() =>
  active.value
    ? `In progress · ${active.value.durationMinutes || 30} min session`
    : 'Nothing in session',
)

/* ── Student context ─────────────────────────────────────── */

const studentHistory = computed(() => {
  const studentId = active.value?.studentId
  if (!studentId)
    return {
      count: 0,
      present: 0,
      late: 0,
      lastReport: null as null | (typeof reports.value)[number],
    }

  const theirs = classesStore.schedules.filter(
    (item) => item.studentId === studentId && item.status === 'completed',
  )
  const lastReport =
    reports.value
      .filter((report) => report.studentId === studentId)
      .sort((a, b) => ((a.submittedAt ?? '') < (b.submittedAt ?? '') ? 1 : -1))[0] ?? null

  return {
    count: theirs.length,
    present: theirs.filter((item) => (item.attendanceStatus || '').includes('present')).length,
    late: theirs.filter((item) => (item.attendanceStatus || '').includes('late')).length,
    lastReport,
  }
})

/* ── Actions ─────────────────────────────────────────────── */

function payload(): LessonConductPayload {
  return {
    curriculumPlan: draft.curriculumPlan,
    attendanceStatus: draft.attendanceStatus || undefined,
    participationLevel: draft.participationLevel || undefined,
    participationNotes: draft.participationNotes,
    recordingUrl: draft.recordingUrl,
  }
}

async function save() {
  if (!active.value) return
  try {
    await classesStore.saveConduct(active.value.id, payload())
  } catch {
    // store surfaces the error
  }
}

async function complete() {
  if (!active.value) return
  try {
    await classesStore.completeClass(active.value.id, payload())
    await Promise.allSettled([classesStore.fetchMine(), classesStore.fetchHistory()])
    await router.push('/teacher/report')
  } catch {
    // store surfaces the error
  }
}

function openMeeting() {
  if (active.value?.meetingLink) window.open(active.value.meetingLink, '_blank', 'noopener')
}

onMounted(async () => {
  if (!classesStore.schedules.length) await classesStore.fetchMine()
})
</script>

<template>
  <section class="session">
    <p v-if="conductMessage" class="banner" role="status">{{ conductMessage }}</p>
    <p v-if="classError" class="banner error" role="alert">{{ classError }}</p>

    <div v-if="!active" class="empty-state">
      <p class="empty-title">No class in session</p>
      <p class="empty-copy">
        Start a class from your week and it will open here for you to record.
      </p>
      <RouterLink class="empty-link" to="/teacher/week">Back to my week</RouterLink>
    </div>

    <template v-else>
      <div v-if="inProgress.length > 1" class="switcher">
        <button
          v-for="item in inProgress"
          :key="item.id"
          type="button"
          class="switch"
          :class="{ active: item.id === active.id }"
          @click="selectedId = item.id"
        >
          {{ item.student?.fullName ?? 'Student' }}
        </button>
      </div>

      <div class="topline">
        <p class="topmeta">
          {{ active.student?.fullName ?? 'Student' }} · {{ formatDate(active.classDate) }},
          {{ active.timeSlot.replace('-', ' – ') }}
        </p>
        <div class="topactions">
          <button
            type="button"
            class="btn-ghost"
            :disabled="!active.meetingLink"
            @click="openMeeting"
          >
            Open meeting link
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="savingId === active.id"
            @click="complete"
          >
            {{ savingId === active.id ? 'Saving…' : 'Mark lesson complete' }}
          </button>
        </div>
      </div>

      <div class="split">
        <div class="col">
          <div class="card">
            <p class="card-label">Attendance</p>
            <div class="segmented">
              <button
                v-for="option in ATTENDANCE"
                :key="option"
                type="button"
                class="seg"
                :class="{ active: draft.attendanceStatus === option }"
                @click="draft.attendanceStatus = draft.attendanceStatus === option ? '' : option"
              >
                {{ option }}
              </button>
            </div>
            <p class="card-note">Marking absent notifies the admin and the student's guardian.</p>
          </div>

          <div class="card">
            <p class="card-label">Participation</p>
            <div class="segmented">
              <button
                v-for="option in PARTICIPATION"
                :key="option"
                type="button"
                class="seg"
                :class="{ active: draft.participationLevel === option }"
                @click="
                  draft.participationLevel = draft.participationLevel === option ? '' : option
                "
              >
                {{ option }}
              </button>
            </div>
            <textarea
              v-model="draft.participationNotes"
              rows="3"
              placeholder="How they engaged — what clicked, what needed prompting."
            />
          </div>

          <div class="card">
            <p class="card-label">Curriculum coverage</p>
            <div class="field">
              <label for="plan">Planned this session</label>
              <input
                id="plan"
                v-model="draft.curriculumPlan"
                type="text"
                placeholder="Ch. 4 · Completing the square"
              />
            </div>
            <div class="field">
              <label for="recording">Recording link</label>
              <input
                id="recording"
                v-model="draft.recordingUrl"
                type="url"
                placeholder="https://…"
              />
            </div>
            <button
              type="button"
              class="btn-ghost wide"
              :disabled="savingId === active.id"
              @click="save"
            >
              {{ savingId === active.id ? 'Saving…' : 'Save without completing' }}
            </button>
          </div>
        </div>

        <aside class="col side">
          <div class="card student">
            <div class="student-head">
              <span class="avatar" aria-hidden="true">
                {{ initialsFrom(active.student?.fullName || 'Student') }}
              </span>
              <div>
                <p class="student-name">{{ active.student?.fullName ?? 'Student' }}</p>
                <p class="student-meta">
                  {{ studentHistory.count + 1
                  }}{{
                    studentHistory.count === 0
                      ? 'st'
                      : studentHistory.count === 1
                        ? 'nd'
                        : studentHistory.count === 2
                          ? 'rd'
                          : 'th'
                  }}
                  lesson with you
                </p>
              </div>
            </div>

            <div class="factline">
              <p class="fact-label">Attendance history</p>
              <p class="fact-value">
                {{ studentHistory.present }} present · {{ studentHistory.late }} late
              </p>
            </div>

            <div class="factline">
              <p class="fact-label">Last report</p>
              <p class="fact-value">
                {{
                  studentHistory.lastReport?.submittedAt
                    ? formatDateTime(studentHistory.lastReport.submittedAt)
                    : 'None yet'
                }}
              </p>
            </div>
          </div>

          <div v-if="studentHistory.lastReport" class="card">
            <p class="card-label">Previous report</p>
            <p class="prev-body">
              {{
                studentHistory.lastReport.remarks ||
                studentHistory.lastReport.lessonTopic ||
                'No notes recorded.'
              }}
            </p>
          </div>

          <p class="nextnote">
            Completing opens the lesson report. The class archives once the student sends feedback.
          </p>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.session {
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
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.switch.active {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
}

.topline {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.topmeta {
  font-size: 13px;
  color: var(--lh-muted);
}

.topactions {
  margin-left: auto;
  display: flex;
  gap: 9px;
}

.btn-ghost,
.btn-primary {
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

.btn-ghost {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
}

.btn-ghost:hover:not(:disabled) {
  color: var(--lh-ink);
}

.btn-ghost.wide {
  width: 100%;
  margin-top: 4px;
}

.btn-primary {
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font-weight: 800;
}

.btn-primary:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.btn-ghost:disabled,
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-ghost:focus-visible,
.btn-primary:focus-visible,
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

.card-label {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.card-note {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

.segmented {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.seg {
  flex: 1;
  height: 38px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  text-transform: capitalize;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    color var(--lh-ease);
}

.seg:hover {
  color: var(--lh-ink);
}

.seg.active {
  background: var(--lh-accent);
  box-shadow: none;
  color: var(--lh-on-accent);
  font-weight: 800;
}

.seg:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
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
  line-height: 1.5;
}

input {
  height: 38px;
  margin-top: 7px;
  padding: 0 12px;
}

textarea {
  resize: vertical;
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

.field {
  margin-top: 14px;
}

.field label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

/* ── Side ───────────────────────────────────────────────── */

.student-head {
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

.student-name {
  font-size: 14.5px;
  font-weight: 700;
}

.student-meta {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--lh-dim);
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
  margin-top: 14px;
  border-top: 1px solid var(--lh-line);
}

.fact-label {
  font-size: 11.5px;
  color: var(--lh-dim);
}

.fact-value {
  font-size: 12.5px;
  font-weight: 600;
}

.prev-body {
  margin-top: 10px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lh-muted);
  text-wrap: pretty;
}

.nextnote {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--lh-dim);
}

@media (max-width: 1000px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
