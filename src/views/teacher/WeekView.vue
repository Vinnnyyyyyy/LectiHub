<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore, type ConfirmedSchedule } from '../../stores/classes'
import UpcomingClassesPanel from '../../components/UpcomingClassesPanel.vue'
import NotificationsPanel from '../../components/NotificationsPanel.vue'

const classesStore = useClassesStore()

const { loading, joiningId, joinMessage, error: joinError } = storeToRefs(classesStore)
const updatingProviderId = ref<number | null>(null)
const upcoming = computed(() => classesStore.upcoming)

async function handleJoinClass(item: ConfirmedSchedule, meetingProvider?: string) {
  try {
    await classesStore.joinClass(item.id, meetingProvider)
  } catch {
    // store sets error message
  }
}

async function handleUpdateProvider(item: ConfirmedSchedule, meetingProvider: string) {
  updatingProviderId.value = item.id
  try {
    await classesStore.updateMeetingProvider(item.id, meetingProvider)
  } catch {
    // store sets error message
  } finally {
    updatingProviderId.value = null
  }
}
</script>

<template>
  <section class="dash-section">
    <p v-if="joinMessage" class="join-feedback" role="status">{{ joinMessage }}</p>
    <p v-if="joinError" class="join-feedback error" role="alert">{{ joinError }}</p>

    <div class="dash-grid-2">
      <UpcomingClassesPanel
        title="Upcoming classes"
        subtitle="At the scheduled time, join the online meeting with your student."
        empty-text="No upcoming classes assigned yet."
        :items="upcoming"
        :loading="loading"
        :allow-join="true"
        :joining-id="joiningId"
        :updating-provider-id="updatingProviderId"
        show-student
        @join="handleJoinClass"
        @update-provider="handleUpdateProvider"
      />
      <NotificationsPanel
        subtitle="New assignments include student, date/time, duration, and meeting details."
        empty-text="No class assignment notifications yet."
      />
    </div>
  </section>
</template>
