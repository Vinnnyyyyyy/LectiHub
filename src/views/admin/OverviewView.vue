<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAdminMonitoringStore } from '../../stores/adminMonitoring'
import { useAdminScheduleStore } from '../../stores/adminSchedule'
import { initialsFrom } from '../../utils/initials'
import { formatDate, formatSlotWindow, hoursSince, relativeTime } from '../../utils/datetime'
import { usePageEyebrow, usePageTitle } from '../../composables/usePageMeta'
import { useAuthStore } from '../../stores/auth'
import AdminMonitoringPanel from '../../components/AdminMonitoringPanel.vue'

const monitoringStore = useAdminMonitoringStore()
const adminStore = useAdminScheduleStore()
const authStore = useAuthStore()
const router = useRouter()

const {
  overview,
  loading: loadingMonitoring,
  error: monitoringError,
} = storeToRefs(monitoringStore)
const { requests, loadingRequests } = storeToRefs(adminStore)

const showDetail = ref(false)
const openingId = ref<number | null>(null)

usePageEyebrow(() =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
)

usePageTitle(() => {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const name = (authStore.fullName || authStore.username || '').split(' ')[0]
  return name ? `Good ${part}, ${name}` : `Good ${part}`
})

/* ── Stat strip ──────────────────────────────────────────── */

const staleCount = computed(() => requests.value.filter((r) => hoursSince(r.createdAt) > 48).length)

const reportsOutstanding = computed(() => {
  const summary = overview.value?.summary
  if (!summary) return 0
  return Math.max(0, summary.completedClasses - summary.lessonReports)
})

const reportsBreakdown = computed(() => {
  const teachers = overview.value?.teacherPerformance ?? []
  const behind = teachers
    .map((t) => ({ name: t.fullName, owed: Math.max(0, t.completedClasses - t.reportsSubmitted) }))
    .filter((t) => t.owed > 0)
    .sort((a, b) => b.owed - a.owed)
    .slice(0, 2)
  if (!behind.length) return 'All reports filed'
  return behind.map((t) => `${t.name} · ${t.owed}`).join(', ')
})

const stats = computed(() => {
  const summary = overview.value?.summary
  const classStats = overview.value?.classStats
  const attendance = overview.value?.attendance

  return [
    {
      key: 'review',
      label: 'Awaiting review',
      value: String(requests.value.length),
      meta: staleCount.value ? `${staleCount.value} older than 48h` : 'None older than 48h',
      tone: requests.value.length ? 'warm' : 'ink',
      to: '/admin/requests',
    },
    {
      key: 'scheduled',
      label: 'Classes scheduled',
      value: String(classStats?.scheduled ?? 0),
      meta: `${summary?.inProgressClasses ?? 0} in progress · ${classStats?.completed ?? 0} completed`,
      tone: 'ink',
      to: null,
    },
    {
      key: 'attendance',
      label: 'Attendance',
      value: attendance ? `${Math.round(attendance.presentRate)}%` : '—',
      meta: attendance?.absent
        ? `${attendance.absent} absence${attendance.absent === 1 ? '' : 's'} to follow up`
        : 'No absences recorded',
      tone: attendance && attendance.presentRate < 80 ? 'danger' : 'ink',
      to: null,
    },
    {
      key: 'reports',
      label: 'Reports outstanding',
      value: String(reportsOutstanding.value),
      meta: reportsBreakdown.value,
      tone: reportsOutstanding.value ? 'danger' : 'ink',
      to: '/admin/reports',
    },
  ]
})

/* ── Needs a decision ────────────────────────────────────── */

const decisions = computed(() => requests.value.slice(0, 5))

function requestChip(request: (typeof requests.value)[number]) {
  if (request.source === 'free_trial') return { label: 'Free trial', tone: 'warm' }
  if (request.program) return { label: request.program, tone: 'accent' }
  return { label: 'Class', tone: 'accent' }
}

function requestWhen(request: (typeof requests.value)[number]) {
  if (!request.slots.length) return 'No preferred slots submitted'
  const first = request.slots[0]!
  return `${formatDate(first.preferredDate)} · ${formatSlotWindow(request.slots)}`
}

async function openRequest(id: number) {
  openingId.value = id
  try {
    await adminStore.fetchRequestReview(id)
    await router.push('/admin/requests')
  } catch {
    // store surfaces the error on the requests screen
  } finally {
    openingId.value = null
  }
}

/* ── Right column ────────────────────────────────────────── */

const inSession = computed(() => overview.value?.summary.inProgressClasses ?? 0)

const teacherLoad = computed(() => {
  const teachers = overview.value?.teacherPerformance ?? []
  const peak = Math.max(1, ...teachers.map((t) => t.completedClasses))
  return teachers
    .slice()
    .sort((a, b) => b.completedClasses - a.completedClasses)
    .map((t) => ({
      id: t.id,
      name: t.fullName,
      subject: t.subjectExpertise,
      classes: t.completedClasses,
      percent: Math.round((t.completedClasses / peak) * 100),
    }))
})

const activity = computed(() => {
  const items: { id: string; text: string; at: string | null }[] = []

  for (const report of overview.value?.recentLessonReports ?? []) {
    items.push({
      id: `report-${report.id}`,
      text: `${report.teacher?.fullName ?? 'A teacher'} filed a lesson report for ${report.student?.fullName ?? 'a student'}`,
      at: report.submittedAt,
    })
  }

  for (const entry of overview.value?.recentStudentFeedback ?? []) {
    items.push({
      id: `feedback-${entry.id}`,
      text: `${entry.student?.fullName ?? 'A student'} rated ${entry.teacher?.fullName ?? 'a teacher'}${
        entry.overallRating ? ` ${entry.overallRating}/5` : ''
      }`,
      at: entry.submittedAt,
    })
  }

  return items
    .filter((item) => item.at)
    .sort((a, b) => (a.at! < b.at! ? 1 : -1))
    .slice(0, 5)
})

const loading = computed(() => loadingMonitoring.value || loadingRequests.value)
</script>

<template>
  <section class="overview">
    <div v-if="monitoringError" class="banner" role="alert">{{ monitoringError }}</div>

    <div class="stat-strip">
      <component
        :is="stat.to ? 'button' : 'div'"
        v-for="stat in stats"
        :key="stat.key"
        :type="stat.to ? 'button' : undefined"
        class="stat"
        :class="{ interactive: !!stat.to }"
        @click="stat.to && router.push(stat.to)"
      >
        <p class="stat-label">{{ stat.label }}</p>
        <p class="stat-value" :class="stat.tone">{{ loading ? '—' : stat.value }}</p>
        <p class="stat-meta">{{ stat.meta }}</p>
      </component>
    </div>

    <div class="split">
      <div class="col">
        <div class="col-head">
          <h2>Needs a decision</h2>
          <RouterLink class="col-link" to="/admin/requests">Open review queue →</RouterLink>
        </div>

        <p v-if="loadingRequests" class="empty">Loading queue…</p>
        <p v-else-if="!decisions.length" class="empty">Nothing waiting. The queue is clear.</p>

        <div v-else class="decisions">
          <div v-for="request in decisions" :key="request.id" class="decision">
            <span class="tile" aria-hidden="true">
              {{ initialsFrom(request.student?.fullName || 'Student') }}
            </span>

            <div class="decision-copy">
              <div class="decision-title">
                <p class="who">{{ request.student?.fullName || 'Student' }}</p>
                <span class="chip" :class="requestChip(request).tone">
                  {{ requestChip(request).label }}
                </span>
              </div>
              <p class="decision-meta">
                {{ requestWhen(request) }}
                <span v-if="hoursSince(request.createdAt) > 48" class="stale">· waiting 48h+</span>
              </p>
            </div>

            <button
              type="button"
              class="btn-primary"
              :disabled="openingId === request.id"
              @click="openRequest(request.id)"
            >
              {{ openingId === request.id ? 'Opening…' : 'Review' }}
            </button>
          </div>
        </div>

        <p v-if="requests.length > decisions.length" class="more">
          {{ requests.length - decisions.length }} more awaiting review →
        </p>
      </div>

      <aside class="col side">
        <div class="live" :class="{ quiet: !inSession }">
          <div class="live-head">
            <p class="eyebrow">In session now</p>
            <p v-if="inSession" class="live-count">{{ inSession }}</p>
          </div>
          <p class="live-copy">
            {{
              inSession
                ? `${inSession} class${inSession === 1 ? '' : 'es'} running right now.`
                : 'No classes in progress.'
            }}
          </p>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3>Teacher load</h3>
            <p class="eyebrow">Completed</p>
          </div>
          <p v-if="!teacherLoad.length" class="empty small">No teacher activity yet.</p>
          <div v-for="teacher in teacherLoad" v-else :key="teacher.id" class="load-row">
            <div class="load-copy">
              <p class="load-name">{{ teacher.name }}</p>
              <p class="load-sub">{{ teacher.subject || 'No subject set' }}</p>
            </div>
            <span class="meter" aria-hidden="true">
              <span class="meter-fill" :style="{ width: `${teacher.percent}%` }" />
            </span>
            <p class="load-value">{{ teacher.classes }}</p>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3>Recent activity</h3>
          </div>
          <p v-if="!activity.length" class="empty small">Nothing logged yet.</p>
          <div v-for="item in activity" v-else :key="item.id" class="activity-row">
            <p class="activity-text">{{ item.text }}</p>
            <p class="activity-when">{{ relativeTime(item.at) }}</p>
          </div>
        </div>
      </aside>
    </div>

    <details class="detail" @toggle="showDetail = !showDetail">
      <summary>Detailed monitoring</summary>
      <AdminMonitoringPanel
        v-if="showDetail"
        :overview="overview"
        :loading="loadingMonitoring"
        :error="monitoringError"
        @refresh="monitoringStore.fetchOverview()"
      />
    </details>
  </section>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-width: 0;
}

.banner {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
  font-size: 12.5px;
}

/* Hairline grid: 1px gaps over a line-colored bed. */
.stat-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--lh-line);
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
}

.stat {
  padding: 16px 18px;
  border: 0;
  background: var(--lh-bg);
  color: inherit;
  font: inherit;
  text-align: left;
}

.stat.interactive {
  cursor: pointer;
  transition: background var(--lh-ease);
}

.stat.interactive:hover {
  background: var(--lh-bg-elevated);
}

.stat.interactive:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.stat-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.stat-value {
  margin-top: 10px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 34px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--lh-ink);
}

.stat-value.warm {
  color: var(--lh-warm);
}

.stat-value.danger {
  color: var(--lh-danger);
}

.stat-meta {
  margin-top: 7px;
  font-size: 12px;
  color: var(--lh-faint);
}

.split {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 32px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.col-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}

.col-head h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.col-link {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--lh-accent);
  text-decoration: none;
}

.col-link:hover {
  color: var(--lh-accent-hover);
}

.decisions {
  display: flex;
  flex-direction: column;
}

.decision {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 15px 0;
  border-top: 1px solid var(--lh-line-strong);
}

.tile {
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

.decision-copy {
  flex: 1;
  min-width: 0;
}

.decision-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.who {
  font-size: 14.5px;
  font-weight: 700;
}

.chip {
  padding: 2px 7px;
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

.decision-meta {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.stale {
  color: var(--lh-warm);
}

.btn-primary {
  flex: 0 0 auto;
  height: 29px;
  padding: 0 13px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn-primary:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.more {
  font-size: 12.5px;
  color: var(--lh-faint);
}

.empty {
  padding: 15px 0;
  border-top: 1px solid var(--lh-line);
  font-size: 12.5px;
  color: var(--lh-muted);
}

.empty.small {
  padding: 9px 0 0;
  border-top: 0;
}

.side {
  gap: 20px;
}

.live {
  padding: 18px 20px;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.live.quiet {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.live-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 9px;
}

.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.live-count {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  line-height: 1;
  color: var(--lh-accent);
}

.live-copy {
  margin-top: 9px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.panel {
  padding-top: 4px;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 9px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--lh-line);
}

.panel-head h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.load-row {
  display: grid;
  grid-template-columns: 1fr 60px auto;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--lh-line);
}

.load-copy {
  min-width: 0;
}

.load-name {
  font-size: 13px;
  font-weight: 600;
}

.load-sub {
  font-size: 11px;
  color: var(--lh-dim);
}

.meter {
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--lh-ink) 7%, transparent);
  overflow: hidden;
}

.meter-fill {
  display: block;
  height: 100%;
  background: var(--lh-accent);
}

.load-value {
  font-size: 12px;
  color: var(--lh-muted);
}

.activity-row {
  padding: 11px 0;
  border-bottom: 1px solid var(--lh-line);
}

.activity-text {
  font-size: 12.5px;
  color: var(--lh-muted);
}

.activity-when {
  margin-top: 3px;
  font-size: 11px;
  color: var(--lh-dim);
}

.detail summary {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--lh-faint);
  cursor: pointer;
}

.detail summary:hover {
  color: var(--lh-ink);
}

.detail[open] summary {
  margin-bottom: 14px;
  color: var(--lh-ink);
}

@media (max-width: 1100px) {
  .split {
    grid-template-columns: 1fr;
    gap: 22px;
  }
}

@media (max-width: 760px) {
  .stat-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
