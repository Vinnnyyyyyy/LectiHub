<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore } from '../../stores/classes'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useStudentFeedbackStore, type StudentFeedbackPayload } from '../../stores/studentFeedback'
import StudentHistoryWorkspace from '../../components/StudentHistoryWorkspace.vue'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()

const { loading: loadingClasses, loadingHistory } = storeToRefs(classesStore)
const { loading: loadingReports, reports: lessonReports } = storeToRefs(lessonReportsStore)
const {
  loading: loadingFeedback,
  submittingId: feedbackSubmittingId,
  message: feedbackMessage,
  error: feedbackError,
  feedback: myFeedback,
} = storeToRefs(studentFeedbackStore)

const past = computed(() => classesStore.past)
const archivedHistory = computed(() => classesStore.archived)

async function handleSubmitFeedback(reportId: number, payload: StudentFeedbackPayload) {
  try {
    await studentFeedbackStore.submitForReport(reportId, payload)
    await Promise.allSettled([
      lessonReportsStore.fetchMine(),
      classesStore.fetchMine(),
      classesStore.fetchHistory(),
    ])
  } catch {
    // store sets error message
  }
}
</script>

<template>
  <section class="dash-section">
    <StudentHistoryWorkspace
      :past="past"
      :lesson-reports="lessonReports"
      :my-feedback="myFeedback"
      :archived-history="archivedHistory"
      :loading-classes="loadingClasses"
      :loading-reports="loadingReports"
      :loading-feedback="loadingFeedback"
      :loading-history="loadingHistory"
      :feedback-submitting-id="feedbackSubmittingId"
      :feedback-message="feedbackMessage"
      :feedback-error="feedbackError"
      @submit-feedback="handleSubmitFeedback"
    />
  </section>
</template>
