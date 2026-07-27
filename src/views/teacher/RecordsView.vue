<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore } from '../../stores/classes'
import { useLessonReportsStore } from '../../stores/lessonReports'
import UpcomingClassesPanel from '../../components/UpcomingClassesPanel.vue'
import LessonReportsPanel from '../../components/LessonReportsPanel.vue'
import ClassHistoryPanel from '../../components/ClassHistoryPanel.vue'

const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()

const { loading, loadingHistory } = storeToRefs(classesStore)
const { loading: loadingReports, reports: lessonReports } = storeToRefs(lessonReportsStore)

const past = computed(() => classesStore.past)
const archivedHistory = computed(() => classesStore.archived)
</script>

<template>
  <section class="dash-section">
    <div class="dash-grid-2">
      <LessonReportsPanel
        title="Submitted lesson reports"
        subtitle="Reports you have filed for completed classes."
        empty-text="No lesson reports submitted yet."
        :items="lessonReports"
        :loading="loadingReports"
        show-student
      />
      <UpcomingClassesPanel
        title="Past classes"
        subtitle="Completed lessons with attendance, participation, and recordings."
        empty-text="No past classes yet."
        :items="past"
        :loading="loading"
        show-student
      />
    </div>
    <ClassHistoryPanel
      title="Teaching history"
      subtitle="Classes archived after both the lesson report and student feedback are submitted."
      empty-text="No archived teaching history yet."
      :items="archivedHistory"
      :loading="loadingHistory"
      show-student
    />
  </section>
</template>
