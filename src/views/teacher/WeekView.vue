<script setup lang="ts">
/**
 * My teaching week — the teacher's home. Week grid of their own classes and
 * open hours, with what's live now and what needs filing beside it.
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useClassesStore, type ConfirmedSchedule } from '../../stores/classes'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useAvailabilityStore } from '../../stores/availability'
import { useAuthStore } from '../../stores/auth'
import { TIME_SLOTS } from '../../constants/timeSlots'
import { usePageEyebrow, usePageTitle } from '../../composables/usePageMeta'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const availabilityStore = useAvailabilityStore()
const authStore = useAuthStore()
const router = useRouter()

const { schedules, loading, joiningId } = storeToRefs(classesStore)
const { reports } = storeToRefs(lessonReportsStore)
const { mySlots, timeSlots: storeTimeSlots } = storeToRefs(availabilityStore)

/** Prefer API slot grid from centre settings; fall back to 30-min defaults. */
const TIME_SLOT_ROWS = computed(() =>
  storeTimeSlots.value?.length ? storeTimeSlots.value : [...TIME_SLOTS],
)

const weekOffset = ref(0)

/* ── Week maths ──────────────────────────────────────────── */

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const days = computed(() => {
  const now = new Date()
  const offsetToMonday = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetToMonday)
  monday.setDate(monday.getDate() + weekOffset.value * 7)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(date.getDate() + index)
    return {
      iso: isoDate(date),
      weekday: date.getDay(),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      dayNumber: date.getDate(),
      isToday: isoDate(date) === isoDate(new Date()),
      isPast: isoDate(date) < isoDate(new Date()),
    }
  })
})

const rangeLabel = computed(() => {
  const start = new Date(`${days.value[0]!.iso}T00:00:00`)
  const end = new Date(`${days.value[6]!.iso}T00:00:00`)
  const sameMonth = start.getMonth() === end.getMonth()
  return `${start.toLocaleDateString(undefined, {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`
})

usePageTitle(() => rangeLabel.value)
usePageEyebrow(() => {
  const name = authStore.fullName || authStore.username || 'Teacher'
  if (weekOffset.value === 0) return `This week · ${name}`
  if (weekOffset.value === 1) return `Next week · ${name}`
  return `${rangeLabel.value} · ${name}`
})

/* ── Grid ────────────────────────────────────────────────── */

const cellKey = (date: string, slot: string) => `${date}|${slot}`
const isHourStart = (slot: string) => slot.slice(3, 5) === '00'

const weekClasses = computed(() => {
  const within = new Set(days.value.map((day) => day.iso))
  return schedules.value.filter((item) => within.has(item.classDate))
})

const classesByCell = computed(() => {
  const map = new Map<string, ConfirmedSchedule[]>()
  for (const item of weekClasses.value) {
    const key = cellKey(item.classDate, item.timeSlot)
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }
  return map
})

/** Weekly open-hour pattern, keyed by weekday + slot. */
const openPattern = computed(() => {
  const set = new Set<string>()
  for (const slot of mySlots.value) {
    if (slot.isOpen) set.add(`${slot.weekday}|${slot.timeSlot}`)
  }
  return set
})

const isOpenHour = (weekday: number, slot: string) => openPattern.value.has(`${weekday}|${slot}`)

const teachingMinutes = computed(() =>
  weekClasses.value.reduce((sum, item) => sum + (item.durationMinutes || 30), 0),
)

const teachingHours = computed(() => {
  const hours = teachingMinutes.value / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
})

/* ── Right column ────────────────────────────────────────── */

const liveClass = computed(
  () => weekClasses.value.find((item) => item.status === 'in_progress') ?? null,
)

const nextClass = computed(() => {
  const now = new Date()
  return (
    weekClasses.value
      .filter((item) => item.status === 'scheduled')
      .filter((item) => new Date(`${item.classDate}T${item.timeSlot.split('-')[0]}:00`) >= now)
      .sort((a, b) =>
        `${a.classDate}${a.timeSlot}` < `${b.classDate}${b.timeSlot}` ? -1 : 1,
      )[0] ?? null
  )
})

const spotlight = computed(() => liveClass.value ?? nextClass.value)

const reportedClassIds = computed(() => new Set(reports.value.map((report) => report.classId)))

const needsYou = computed(() => {
  const items: { id: string; title: string; detail: string; tone: string }[] = []

  for (const item of schedules.value) {
    if (item.status === 'completed' && !reportedClassIds.value.has(item.id)) {
      items.push({
        id: `report-${item.id}`,
        title: 'Lesson report due',
        detail: `${item.student?.fullName ?? 'Student'} · ${item.classDate} ${item.timeSlot.split('-')[0]}`,
        tone: 'danger',
      })
    }
    if (
      item.status === 'completed' &&
      (!item.attendanceStatus || item.attendanceStatus === 'not_recorded')
    ) {
      items.push({
        id: `attendance-${item.id}`,
        title: 'Attendance not recorded',
        detail: `${item.student?.fullName ?? 'Student'} · ${item.classDate}`,
        tone: 'warm',
      })
    }
  }

  return items.slice(0, 5)
})

const stats = computed(() => {
  const taught = weekClasses.value.filter((item) => item.status === 'completed')
  const recorded = taught.filter(
    (item) => item.attendanceStatus && item.attendanceStatus !== 'not_recorded',
  )
  const present = recorded.filter((item) => (item.attendanceStatus || '').includes('present'))
  const filed = taught.filter((item) => reportedClassIds.value.has(item.id))

  return [
    { label: 'Classes taught', value: String(taught.length) },
    {
      label: 'Attendance rate',
      value: recorded.length ? `${Math.round((present.length / recorded.length) * 100)}%` : '—',
    },
    { label: 'Reports filed', value: `${filed.length} of ${taught.length}` },
  ]
})

async function handleJoin(item: ConfirmedSchedule) {
  try {
    await classesStore.joinClass(item.id)
    await router.push('/teacher/session')
  } catch {
    // store surfaces the error
  }
}

onMounted(async () => {
  await Promise.allSettled([
    classesStore.fetchMine(),
    lessonReportsStore.fetchMine(),
    availabilityStore.fetchMine(),
  ])
})
</script>

<template>
  <section class="week">
    <div class="toolbar">
      <div class="weeknav">
        <button type="button" class="step" aria-label="Previous week" @click="weekOffset--">
          ‹
        </button>
        <button type="button" class="today" @click="weekOffset = 0">Today</button>
        <button type="button" class="step" aria-label="Next week" @click="weekOffset++">›</button>
      </div>

      <div class="hours">
        <p class="eyebrow">Teaching hours</p>
        <p class="hours-value">{{ teachingHours }}<span class="of">/20h</span></p>
      </div>

      <div class="legend" aria-hidden="true">
        <span class="key confirmed" />Confirmed class <span class="key open" />Your open hour
      </div>
    </div>

    <div class="workspace">
      <div class="board">
        <div class="grid">
          <div class="gutter head" />
          <div
            v-for="day in days"
            :key="day.iso"
            class="dayhead"
            :class="{ today: day.isToday, past: day.isPast }"
          >
            <p class="dayname">{{ day.label }}</p>
            <p class="daynum">{{ day.dayNumber }}</p>
          </div>

          <template v-for="slot in TIME_SLOT_ROWS" :key="slot">
            <div class="gutter">
              <span v-if="isHourStart(slot)">{{ slot.split('-')[0] }}</span>
            </div>

            <div
              v-for="day in days"
              :key="day.iso + slot"
              class="cell"
              :class="{ past: day.isPast }"
            >
              <span
                v-for="item in classesByCell.get(cellKey(day.iso, slot)) ?? []"
                :key="item.id"
                class="block"
                :class="item.status === 'in_progress' ? 'live' : 'confirmed'"
                :title="`${item.subject || item.title} · ${item.student?.fullName ?? 'Student'}`"
              >
                <span v-if="item.status === 'in_progress'" class="livedot" aria-hidden="true" />
                {{ item.subject || item.title }} ·
                {{ item.student?.fullName?.split(' ')[0] ?? 'Student' }}
              </span>

              <span
                v-if="!classesByCell.has(cellKey(day.iso, slot)) && isOpenHour(day.weekday, slot)"
                class="block open"
              >
                Open hour
              </span>
            </div>
          </template>
        </div>

        <p class="gridnote">
          Open hours come from your weekly pattern under Open hours &amp; calendar.
        </p>
      </div>

      <aside class="side">
        <div v-if="spotlight" class="spotlight" :class="{ live: !!liveClass }">
          <div class="spot-head">
            <span class="dot" aria-hidden="true" />
            <p class="spot-eyebrow">{{ liveClass ? 'In session' : 'Up next' }}</p>
            <p class="spot-time">{{ spotlight.timeSlot.split('-')[0] }}</p>
          </div>
          <p class="spot-title">{{ spotlight.subject || spotlight.title || 'Class' }}</p>
          <p class="spot-meta">
            {{ spotlight.student?.fullName ?? 'Student' }} · {{ spotlight.durationMinutes || 30 }}
            min
          </p>
          <button
            type="button"
            class="spot-btn"
            :disabled="joiningId === spotlight.id"
            @click="handleJoin(spotlight)"
          >
            {{
              joiningId === spotlight.id
                ? 'Opening…'
                : liveClass
                  ? 'Continue class'
                  : 'Join & start class'
            }}
          </button>
        </div>

        <div v-else class="spotlight quiet">
          <p class="spot-eyebrow">Nothing scheduled</p>
          <p class="spot-meta">No upcoming classes this week.</p>
        </div>

        <div class="panel">
          <p class="eyebrow">Needs you</p>
          <p v-if="!needsYou.length" class="panel-empty">Nothing outstanding.</p>
          <div v-for="item in needsYou" v-else :key="item.id" class="need">
            <span class="need-mark" :class="item.tone" aria-hidden="true" />
            <div>
              <p class="need-title">{{ item.title }}</p>
              <p class="need-detail">{{ item.detail }}</p>
            </div>
          </div>
        </div>

        <div class="panel">
          <p class="eyebrow">This week</p>
          <div class="statgrid">
            <div v-for="stat in stats" :key="stat.label" class="stat">
              <p class="stat-value">{{ loading ? '—' : stat.value }}</p>
              <p class="stat-label">{{ stat.label }}</p>
            </div>
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

.toolbar {
  display: flex;
  align-items: center;
  gap: 22px;
}

.weeknav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step,
.today {
  height: 29px;
  border: 0;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
  background: transparent;
  color: var(--lh-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: color var(--lh-ease);
}

.step {
  width: 29px;
  font-size: 15px;
  line-height: 1;
}

.today {
  padding: 0 12px;
}

.step:hover,
.today:hover {
  color: var(--lh-ink);
}

.step:focus-visible,
.today:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.hours-value {
  margin-top: 3px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  line-height: 1;
  color: var(--lh-accent);
}

.of {
  font-size: 13px;
  color: var(--lh-faint);
}

.legend {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  font-size: 11px;
  color: var(--lh-faint);
}

.key {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  margin-left: 9px;
}

.key.confirmed {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.key.open {
  background: color-mix(in srgb, var(--lh-ink) 5%, transparent);
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: 18px;
  align-items: start;
}

.board {
  min-width: 0;
}

.grid {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(0, 1fr));
  border-radius: var(--lh-radius-panel);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.gutter {
  padding: 0 7px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 10px;
  color: var(--lh-dim);
  border-right: 1px solid var(--lh-line);
}

.gutter.head {
  height: auto;
}

.dayhead {
  padding: 9px 0 7px;
  text-align: center;
  border-left: 1px solid var(--lh-line);
  border-bottom: 1px solid var(--lh-line);
}

.dayhead.past {
  opacity: 0.55;
}

.dayname {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--lh-dim);
}

.daynum {
  margin-top: 2px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 17px;
  line-height: 1;
}

.dayhead.today .daynum,
.dayhead.today .dayname {
  color: var(--lh-accent);
}

.cell {
  position: relative;
  height: 26px;
  padding: 2px 3px;
  border-left: 1px solid var(--lh-line);
  border-top: 1px solid var(--lh-line);
  overflow: hidden;
}

.cell.past {
  background: color-mix(in srgb, var(--lh-void) 40%, transparent);
}

.block {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block.confirmed {
  background: color-mix(in srgb, var(--lh-accent) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lh-accent) 30%, transparent);
  color: var(--lh-ink);
}

.block.live {
  background: color-mix(in srgb, var(--lh-accent) 26%, transparent);
  box-shadow: inset 0 0 0 1px var(--lh-accent);
  color: var(--lh-ink);
}

.livedot {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lh-accent);
}

.block.open {
  background: color-mix(in srgb, var(--lh-ink) 5%, transparent);
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
  color: var(--lh-faint);
}

.gridnote {
  margin-top: 9px;
  font-size: 11px;
  color: var(--lh-dim);
}

/* ── Side ───────────────────────────────────────────────── */

.side {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.spotlight {
  padding: 16px 17px;
  border-radius: 11px;
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.spotlight.quiet {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.spot-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lh-accent);
}

.spotlight.live .dot {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lh-accent) 20%, transparent);
}

.spot-eyebrow {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-accent);
}

.spotlight.quiet .spot-eyebrow {
  color: var(--lh-dim);
}

.spot-time {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--lh-accent);
}

.spot-title {
  margin-top: 12px;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 19px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.spot-meta {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.spot-btn {
  width: 100%;
  height: 33px;
  margin-top: 14px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
}

.spot-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.spot-btn:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent-hover);
}

.panel-empty {
  margin-top: 9px;
  font-size: 12px;
  color: var(--lh-muted);
}

.need {
  display: flex;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--lh-line);
}

.need:first-of-type {
  margin-top: 4px;
  border-top: 1px solid var(--lh-line);
}

.need-mark {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  margin-top: 6px;
  border-radius: 50%;
}

.need-mark.danger {
  background: var(--lh-danger);
}

.need-mark.warm {
  background: var(--lh-warm);
}

.need-title {
  font-size: 12.5px;
  font-weight: 700;
}

.need-detail {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--lh-faint);
}

.statgrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  margin-top: 9px;
  background: var(--lh-line);
  border-radius: var(--lh-radius-item);
  overflow: hidden;
}

.stat {
  padding: 11px 9px;
  background: var(--lh-bg);
}

.stat-value {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px;
  line-height: 1;
}

.stat-label {
  margin-top: 5px;
  font-size: 10px;
  color: var(--lh-dim);
}

@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .side {
    order: -1;
  }
}
</style>
