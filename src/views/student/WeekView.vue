<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useClassesStore, type ConfirmedSchedule } from '../../stores/classes'
import UpcomingClassesPanel from '../../components/UpcomingClassesPanel.vue'
import NotificationsPanel from '../../components/NotificationsPanel.vue'

const classesStore = useClassesStore()

const {
  loading: loadingClasses,
  joiningId,
  joinMessage,
  error: joinError,
} = storeToRefs(classesStore)

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
        subtitle="At the scheduled time, join your online class from here."
        empty-text="No upcoming classes yet."
        :items="upcoming"
        :loading="loadingClasses"
        :allow-join="true"
        :joining-id="joiningId"
        :updating-provider-id="updatingProviderId"
        show-teacher
        @join="handleJoinClass"
        @update-provider="handleUpdateProvider"
      />
      <NotificationsPanel
        subtitle="Confirmations include your teacher, schedule, meeting info, plus reminders before class."
        empty-text="You’re all caught up."
        show-pending-reminders
      />
    </div>
  </section>
</template>
