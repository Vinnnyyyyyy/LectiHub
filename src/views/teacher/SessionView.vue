<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore, type LessonConductPayload } from '../../stores/classes'
import { useLessonReportsStore, type LessonReportPayload } from '../../stores/lessonReports'
import ConductLessonPanel from '../../components/ConductLessonPanel.vue'
import LessonReportFormPanel from '../../components/LessonReportFormPanel.vue'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()

const { loading, savingId, conductMessage, error: joinError } = storeToRefs(classesStore)
const {
  submittingId: reportSubmittingId,
  message: reportMessage,
  error: reportError,
} = storeToRefs(lessonReportsStore)

const inProgress = computed(() => classesStore.inProgress)
const past = computed(() => classesStore.past)

async function handleSaveConduct(classId: number, payload: LessonConductPayload) {
  try {
    await classesStore.saveConduct(classId, payload)
  } catch {
    // store sets error message
  }
}

async function handleCompleteLesson(classId: number, payload: LessonConductPayload) {
  try {
    await classesStore.completeClass(classId, payload)
    // Refresh so Records / report form stay in sync after completion.
    await Promise.allSettled([classesStore.fetchMine(), classesStore.fetchHistory()])
  } catch {
    // store sets error message (shown above the conduct panel)
  }
}

async function handleSubmitReport(classId: number, payload: LessonReportPayload) {
  try {
    await lessonReportsStore.submitForClass(classId, payload)
    await Promise.allSettled([classesStore.fetchMine(), classesStore.fetchHistory()])
  } catch {
    // store sets error message
  }
}
</script>

<template>
  <section class="dash-section">
    <div class="conduct-workspace">
      <div
        v-if="conductMessage || joinError || reportMessage || reportError"
        class="conduct-banners"
      >
        <p v-if="conductMessage" class="join-feedback" role="status">{{ conductMessage }}</p>
        <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>
        <p v-if="reportMessage" class="join-feedback" role="status">{{ reportMessage }}</p>
        <p v-if="reportError" class="join-feedback error" role="alert">{{ reportError }}</p>
      </div>

      <div class="conduct-columns">
        <ConductLessonPanel
          :items="inProgress"
          :loading="loading"
          :saving-id="savingId"
          @save="handleSaveConduct"
          @complete="handleCompleteLesson"
        />
        <LessonReportFormPanel
          :completed-classes="past"
          :loading="loading"
          :submitting-id="reportSubmittingId"
          @submit="handleSubmitReport"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.conduct-workspace {
  display: grid;
  gap: 12px;
}

.conduct-banners {
  display: grid;
  gap: 9px;
}

.conduct-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.conduct-columns > :deep(.panel) {
  height: 100%;
  min-width: 0;
}

@media (max-width: 900px) {
  .conduct-columns {
    grid-template-columns: 1fr;
  }
}
</style>
