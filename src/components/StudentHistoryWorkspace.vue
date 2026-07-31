<template>
  <section class="history">
    <aside class="sidebar" aria-label="History sections">
      <div class="brand-block">
        <p class="kicker">Learning archive</p>
        <h2>History</h2>
        <p class="side-copy">Past lessons, teacher reports, and your feedback in one place.</p>
      </div>

      <nav class="side-nav" role="tablist" aria-orientation="vertical">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          role="tab"
          class="side-link"
          :class="{ active: activeView === item.id }"
          :aria-selected="activeView === item.id"
          @click="activeView = item.id"
        >
          <span class="side-label">{{ item.label }}</span>
          <span v-if="item.badge != null" class="side-badge">{{ item.badge }}</span>
        </button>
      </nav>
    </aside>

    <div class="main">
      <header class="main-head">
        <div>
          <p class="kicker">{{ activeMeta.kicker }}</p>
          <h3>{{ activeMeta.title }}</h3>
          <p class="main-copy">{{ activeMeta.copy }}</p>
        </div>
      </header>

      <div v-if="feedbackMessage || feedbackError" class="banners">
        <p v-if="feedbackMessage" class="join-feedback" role="status">{{ feedbackMessage }}</p>
        <p v-if="feedbackError" class="join-feedback error" role="alert">{{ feedbackError }}</p>
      </div>

      <div v-show="activeView === 'feedback'" class="view">
        <StudentFeedbackFormPanel
          :reports="lessonReports"
          :loading="loadingReports"
          :submitting-id="feedbackSubmittingId"
          @submit="forwardSubmit"
        />
      </div>

      <div v-show="activeView === 'lessons'" class="view">
        <UpcomingClassesPanel
          title="Lesson history"
          subtitle="Past lessons with attendance notes and recordings when available."
          empty-text="No lessons recorded yet."
          :items="past"
          :loading="loadingClasses"
          show-teacher
        />
      </div>

      <div v-show="activeView === 'reports'" class="view dual">
        <LessonReportsPanel
          title="Lesson reports"
          subtitle="Reports submitted by your teacher after each class."
          empty-text="No lesson reports yet."
          :items="lessonReports"
          :loading="loadingReports"
          show-teacher
        />
        <StudentFeedbackPanel
          title="Your submitted feedback"
          subtitle="Feedback you have shared after lesson reports."
          empty-text="No feedback submitted yet."
          :items="myFeedback"
          :loading="loadingFeedback"
          show-teacher
        />
      </div>

      <div v-show="activeView === 'archived'" class="view">
        <ClassHistoryPanel
          title="Learning history"
          subtitle="Classes archived after both the lesson report and your feedback are submitted."
          empty-text="No archived learning history yet."
          :items="archivedHistory"
          :loading="loadingHistory"
          show-teacher
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConfirmedSchedule } from '../stores/classes'
import type { LessonReport } from '../stores/lessonReports'
import type { StudentFeedback, StudentFeedbackPayload } from '../stores/studentFeedback'
import UpcomingClassesPanel from './UpcomingClassesPanel.vue'
import LessonReportsPanel from './LessonReportsPanel.vue'
import StudentFeedbackFormPanel from './StudentFeedbackFormPanel.vue'
import StudentFeedbackPanel from './StudentFeedbackPanel.vue'
import ClassHistoryPanel from './ClassHistoryPanel.vue'

type HistoryView = 'feedback' | 'lessons' | 'reports' | 'archived'

const props = defineProps<{
  past: ConfirmedSchedule[]
  lessonReports: LessonReport[]
  myFeedback: StudentFeedback[]
  archivedHistory: ConfirmedSchedule[]
  loadingClasses?: boolean
  loadingReports?: boolean
  loadingFeedback?: boolean
  loadingHistory?: boolean
  feedbackSubmittingId?: number | null
  feedbackMessage?: string | null
  feedbackError?: string | null
}>()

const emit = defineEmits<{
  'submit-feedback': [reportId: number, payload: StudentFeedbackPayload]
}>()

const activeView = ref<HistoryView>('feedback')

const pendingFeedbackCount = computed(
  () => props.lessonReports.filter((report) => !report.hasFeedback).length,
)

const navItems = computed(() => [
  {
    id: 'feedback' as const,
    label: 'Pending feedback',
    badge: pendingFeedbackCount.value,
  },
  {
    id: 'lessons' as const,
    label: 'Lesson history',
    badge: props.past.length,
  },
  {
    id: 'reports' as const,
    label: 'Reports & replies',
    badge: props.lessonReports.length + props.myFeedback.length,
  },
  {
    id: 'archived' as const,
    label: 'Archived history',
    badge: props.archivedHistory.length,
  },
])

const activeMeta = computed(() => {
  const map = {
    feedback: {
      kicker: 'Action needed',
      title: 'Pending feedback',
      copy: 'Share your rating and learning experience after each teacher report.',
    },
    lessons: {
      kicker: 'Classes',
      title: 'Lesson history',
      copy: 'Past lessons with attendance, participation, and meeting details.',
    },
    reports: {
      kicker: 'Exchange',
      title: 'Reports & replies',
      copy: 'Teacher reports on the left. Your submitted feedback on the right.',
    },
    archived: {
      kicker: 'Complete',
      title: 'Archived history',
      copy: 'Fully completed classes after report and feedback are both done.',
    },
  }
  return map[activeView.value]
})

function forwardSubmit(reportId: number, payload: StudentFeedbackPayload) {
  emit('submit-feedback', reportId, payload)
}
</script>

<style scoped>
.history {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  min-height: 34rem;
  border: 1px solid var(--lh-line);
  border-radius: 1.1rem;
  overflow: hidden;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
  animation: rise 0.45s ease both;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.15rem 0.9rem 1.1rem;
  border-right: 1px solid var(--lh-line);
  background: linear-gradient(180deg, rgba(36, 44, 54, 0.72), rgba(20, 25, 31, 0.35));
}

.brand-block h2,
.main-head h3 {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 550;
  color: var(--lh-ink);
  margin: 0;
}

.brand-block h2 {
  font-size: 1.35rem;
  margin-top: 0.15rem;
}

.kicker {
  font-family: 'Manrope', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
  margin: 0;
}

.side-copy,
.main-copy,
.side-link,
.side-badge {
  font-family: 'Manrope', sans-serif;
}

.side-copy,
.main-copy {
  margin-top: 0.4rem;
  color: var(--lh-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.side-nav {
  display: grid;
  gap: 0.3rem;
}

.side-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.7rem;
  background: transparent;
  color: var(--lh-muted);
  padding: 0.65rem 0.7rem;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.side-link:hover {
  background: rgba(231, 236, 239, 0.05);
  color: var(--lh-ink);
}

.side-link.active {
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.35);
  color: var(--lh-accent);
}

.side-label {
  font-size: 0.88rem;
  font-weight: 750;
}

.side-badge {
  min-width: 1.35rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: rgba(231, 236, 239, 0.08);
  color: var(--lh-faint);
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.side-link.active .side-badge {
  background: rgba(126, 184, 164, 0.18);
  color: var(--lh-accent);
}

.main {
  min-width: 0;
  padding: 1.15rem 1.2rem 1.25rem;
  background:
    radial-gradient(ellipse 55% 40% at 100% 0%, rgba(126, 184, 164, 0.08), transparent 55%),
    rgba(14, 18, 22, 0.35);
}

.main-head {
  margin-bottom: 1rem;
}

.main-head h3 {
  font-size: 1.4rem;
  margin-top: 0.15rem;
}

.banners {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 0.85rem;
}

.view {
  animation: rise 0.35s ease both;
}

.view.dual {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}

.view :deep(.panel) {
  border-color: rgba(231, 236, 239, 0.1);
  background: rgba(16, 20, 26, 0.45);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .view.dual {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .history {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: none;
    border-bottom: 1px solid var(--lh-line);
  }

  .side-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .side-link {
    width: auto;
  }
}
</style>
