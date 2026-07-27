<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAdminScheduleStore } from '../../stores/adminSchedule'
import { type AppNotification } from '../../stores/notifications'
import NotificationsPanel from '../../components/NotificationsPanel.vue'

const adminStore = useAdminScheduleStore()
const router = useRouter()

// Prime the store, then hand off to the review workspace.
async function openFromNotification(item: AppNotification) {
  if (!item.relatedRequestId) return
  await adminStore.fetchRequestReview(item.relatedRequestId)
  await router.push('/admin/requests')
}
</script>

<template>
  <section class="dash-section">
    <NotificationsPanel
      subtitle="New student scheduling requests appear here for review."
      empty-text="No notifications yet."
      @select="openFromNotification"
    />
  </section>
</template>
