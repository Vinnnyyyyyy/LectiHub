<script setup lang="ts">
/**
 * My week — the student's home. Calmer than the staff views: one hero card
 * for what's live or next, a plain list of what's coming, and a quiet column
 * for the last thing a teacher said.
 */
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore, type ConfirmedSchedule } from '../../stores/classes'
import { useScheduleStore } from '../../stores/schedule'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useHomeworkStore } from '../../stores/homework'
import { useAuthStore } from '../../stores/auth'
import { formatDate, formatDateTime } from '../../utils/datetime'
import { usePageEyebrow, usePageTitle } from '../../composables/usePageMeta'
import NotificationsPanel from '../../components/NotificationsPanel.vue'

const classesStore = useClassesStore()
const scheduleStore = useScheduleStore()
const lessonReportsStore = useLessonReportsStore()
const homeworkStore = useHomeworkStore()
const authStore = useAuthStore()

const { summary: homeworkSummary } = storeToRefs(homeworkStore)

const { loading, joiningId, joinMessage, error: joinError } = storeToRefs(classesStore)
const { requests } = storeToRefs(scheduleStore)
const { reports } = storeToRefs(lessonReportsStore)

usePageEyebrow(() =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
)

usePageTitle(() => {
  const name = (authStore.fullName || authStore.username || '').split(' ')[0]
  return name ? `Hi ${name}` : 'My week'
})

const upcoming = computed(() => classesStore.upcoming)
const liveClass = computed(
  () => upcoming.value.find((item) => item.status === 'in_progress') ?? null,
)
const nextClass = computed(
  () => upcoming.value.find((item) => item.status !== 'in_progress') ?? null,
)
const spotlight = computed(() => liveClass.value ?? nextClass.value)

/** Everything after the hero card. */
const comingUp = computed(() =>
  upcoming.value.filter((item) => item.id !== spotlight.value?.id).slice(0, 6),
)

const pendingRequests = computed(() =>
  requests.value.filter((request) => request.status === 'pending'),
)

/** Most recent report with something written on it. */
const teacherNote = computed(
  () =>
    reports.value
      .filter((report) => report.remarks || report.studentProgress)
      .sort((a, b) => ((a.submittedAt ?? '') < (b.submittedAt ?? '') ? 1 : -1))[0] ?? null,
)

function dayTile(item: ConfirmedSchedule) {
  const date = new Date(`${item.classDate}T00:00:00`)
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    day: date.getDate(),
  }
}

function classTime(item: ConfirmedSchedule) {
  if (item.startTime && item.endTime) return `${item.startTime} – ${item.endTime}`
  return item.timeSlot.replace('-', ' – ')
}

async function handleJoin(item: ConfirmedSchedule) {
  try {
    await classesStore.joinClass(item.id)
  } catch {
    // store surfaces the error
  }
}

onMounted(async () => {
  await Promise.allSettled([
    classesStore.fetchMine(),
    scheduleStore.fetchMine(),
    lessonReportsStore.fetchMine(),
    homeworkStore.fetchMine(),
  ])
})
</script>

<template>
  <section class="week">
    <p v-if="joinMessage" class="banner" role="status">{{ joinMessage }}</p>
    <p v-if="joinError" class="banner error" role="alert">{{ joinError }}</p>

    <div class="split">
      <div class="main">
        <!-- Hero -->
        <div v-if="spotlight" class="hero" :class="{ live: !!liveClass }">
          <p class="hero-eyebrow">
            <span v-if="liveClass" class="dot" aria-hidden="true" />
            {{ liveClass ? 'Your class is live now' : 'Your next class' }}
          </p>
          <h2 class="hero-title">{{ spotlight.subject || spotlight.title || 'Class' }}</h2>
          <p class="hero-meta">
            with {{ spotlight.teacher?.fullName ?? 'your teacher' }} ·
            {{ classTime(spotlight) }}
          </p>
          <button
            type="button"
            class="hero-btn"
            :disabled="joiningId === spotlight.id"
            @click="handleJoin(spotlight)"
          >
            {{ joiningId === spotlight.id ? 'Opening…' : 'Join class' }}
          </button>
          <p class="hero-note">Opens your meeting link in a new tab</p>
        </div>

        <div v-else class="hero quiet">
          <p class="hero-eyebrow">Nothing scheduled</p>
          <h2 class="hero-title">No classes booked yet</h2>
          <p class="hero-meta">Pick a few times that suit you and we'll find a teacher.</p>
          <RouterLink class="hero-btn link" to="/student/book">Book a class</RouterLink>
        </div>

        <!-- Coming up -->
        <div class="section">
          <div class="section-head">
            <h3>Coming up</h3>
            <p class="section-note">Reminders 24h and 1h before each class</p>
          </div>

          <p v-if="loading" class="empty">Loading your week…</p>
          <p v-else-if="!comingUp.length && !pendingRequests.length" class="empty">
            Nothing else booked.
          </p>

          <div v-for="item in comingUp" :key="item.id" class="row">
            <div class="tile">
              <p class="tile-day">{{ dayTile(item).weekday }}</p>
              <p class="tile-num">{{ dayTile(item).day }}</p>
            </div>
            <div class="row-copy">
              <p class="row-title">{{ item.subject || item.title || 'Class' }}</p>
              <p class="row-meta">
                {{ item.teacher?.fullName ?? 'Teacher' }} · {{ classTime(item) }} ·
                {{ item.durationMinutes || 30 }} min
              </p>
            </div>
            <span class="chip accent">Confirmed</span>
          </div>

          <div v-for="request in pendingRequests" :key="`req-${request.id}`" class="row">
            <div class="tile muted">
              <p class="tile-day">
                {{
                  request.slots[0]
                    ? new Date(`${request.slots[0].preferredDate}T00:00:00`)
                        .toLocaleDateString(undefined, { weekday: 'short' })
                        .toUpperCase()
                    : '—'
                }}
              </p>
              <p class="tile-num">
                {{
                  request.slots[0]
                    ? new Date(`${request.slots[0].preferredDate}T00:00:00`).getDate()
                    : '·'
                }}
              </p>
            </div>
            <div class="row-copy">
              <p class="row-title">{{ request.program || 'Class' }} · requested</p>
              <p class="row-meta">Waiting for the center to confirm a teacher</p>
            </div>
            <span class="chip warm">Pending</span>
          </div>
        </div>
      </div>

      <!-- Side -->
      <aside class="side">
        <div class="panel">
          <p class="eyebrow">Alerts</p>
          <div class="alerts">
            <NotificationsPanel
              subtitle="Confirmations, meeting info, and reminders before class."
              empty-text="You're all caught up."
              show-pending-reminders
            />
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <p class="eyebrow">Homework due</p>
            <RouterLink v-if="homeworkSummary.pending" class="panel-link" to="/student/homework">
              {{ homeworkSummary.pending }}
            </RouterLink>
          </div>

          <p v-if="!homeworkStore.dueSoon.length" class="empty small">Nothing due.</p>
          <RouterLink
            v-for="item in homeworkStore.dueSoon.slice(0, 3)"
            v-else
            :key="item.id"
            class="hwrow"
            to="/student/homework"
          >
            <span class="hw-title">{{ item.title }}</span>
            <span class="hw-due">
              {{
                item.dueAt ? `Due ${formatDate(String(item.dueAt).slice(0, 10))}` : 'No due date'
              }}
            </span>
          </RouterLink>
        </div>

        <div v-if="homeworkStore.graded.length" class="panel">
          <div class="panel-head">
            <p class="eyebrow">Recent grades</p>
            <span v-if="homeworkSummary.average != null" class="panel-link">
              {{ Math.round(homeworkSummary.average) }} avg
            </span>
          </div>

          <RouterLink
            v-for="item in homeworkStore.graded.slice(0, 3)"
            :key="item.id"
            class="graderow"
            to="/student/homework"
          >
            <span class="grade-score">
              {{ Math.round(((item.submission?.score ?? 0) / Math.max(1, item.maxScore)) * 100) }}
            </span>
            <span class="grade-title">{{ item.title }}</span>
          </RouterLink>
        </div>

        <div class="panel">
          <p class="eyebrow">From your teacher</p>
          <div v-if="teacherNote" class="note">
            <p class="note-body">{{ teacherNote.remarks || teacherNote.studentProgress }}</p>
            <p class="note-by">
              {{ teacherNote.teacher?.fullName ?? 'Your teacher' }} · lesson report,
              {{ teacherNote.submittedAt ? formatDateTime(teacherNote.submittedAt) : '' }}
            </p>
          </div>
          <p v-else class="empty small">No lesson reports yet.</p>
        </div>

        <div class="panel">
          <p class="eyebrow">Your requests</p>
          <p v-if="!requests.length" class="empty small">You haven't requested a class yet.</p>
          <div v-for="request in requests.slice(0, 4)" v-else :key="request.id" class="reqrow">
            <div>
              <p class="req-title">{{ request.program || 'Class' }}</p>
              <p class="req-meta">
                {{ request.slots.length }} preferred slot{{ request.slots.length === 1 ? '' : 's' }}
              </p>
            </div>
            <span
              class="chip"
              :class="
                request.status === 'approved'
                  ? 'accent'
                  : request.status === 'rejected'
                    ? 'danger'
                    : 'warm'
              "
            >
              {{ request.status }}
            </span>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.week {
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
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 28px;
  align-items: start;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

/* ── Hero ───────────────────────────────────────────────── */

.hero {
  padding: 22px 24px;
  border-radius: 14px;
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.hero.quiet {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-accent);
}

.hero.quiet .hero-eyebrow {
  color: var(--lh-dim);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lh-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lh-accent) 20%, transparent);
}

.hero-title {
  margin-top: 14px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 30px;
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.1;
}

.hero-meta {
  margin-top: 8px;
  font-size: 13.5px;
  color: var(--lh-muted);
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  height: 40px;
  margin-top: 18px;
  padding: 0 20px;
  border: 0;
  border-radius: 9px;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.hero-btn:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.hero-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.hero-btn:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent-hover);
}

.hero-note {
  margin-top: 9px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

/* ── Coming up ──────────────────────────────────────────── */

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 12px;
}

.section-head h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.section-note {
  font-size: 11.5px;
  color: var(--lh-dim);
}

.row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--lh-line);
}

.tile {
  flex: 0 0 46px;
  width: 46px;
  padding: 7px 0;
  border-radius: var(--lh-radius-item);
  background: var(--lh-accent-soft);
  text-align: center;
}

.tile.muted {
  background: var(--lh-chip);
}

.tile-day {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--lh-accent);
}

.tile.muted .tile-day {
  color: var(--lh-faint);
}

.tile-num {
  margin-top: 1px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 19px;
  line-height: 1;
}

.row-copy {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 14.5px;
  font-weight: 700;
}

.row-meta {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.chip {
  flex: 0 0 auto;
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: capitalize;
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

/* ── Side ───────────────────────────────────────────────── */

.alerts {
  margin-top: 8px;
}

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

.note {
  margin-top: 10px;
  padding: 14px 15px;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.note-body {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--lh-muted);
  text-wrap: pretty;
}

.note-by {
  margin-top: 9px;
  font-size: 11px;
  color: var(--lh-dim);
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 9px;
}

.panel-link {
  font-size: 11px;
  font-weight: 800;
  color: var(--lh-accent);
  text-decoration: none;
}

.hwrow {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 0;
  border-bottom: 1px solid var(--lh-line);
  color: inherit;
  text-decoration: none;
}

.hwrow:first-of-type,
.graderow:first-of-type {
  margin-top: 6px;
  border-top: 1px solid var(--lh-line);
}

.hw-title {
  font-size: 12.5px;
  font-weight: 600;
}

.hw-due {
  font-size: 11px;
  color: var(--lh-dim);
}

.graderow {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 0;
  border-bottom: 1px solid var(--lh-line);
  color: inherit;
  text-decoration: none;
}

.grade-score {
  flex: 0 0 2rem;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 17px;
  color: var(--lh-accent);
}

.grade-title {
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reqrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--lh-line);
}

.reqrow:first-of-type {
  margin-top: 6px;
  border-top: 1px solid var(--lh-line);
}

.req-title {
  font-size: 13px;
  font-weight: 600;
}

.req-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--lh-dim);
}

.empty {
  padding: 16px 0;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

.empty.small {
  margin-top: 8px;
  padding: 0;
  border-top: 0;
  font-size: 12px;
}

@media (max-width: 1000px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
