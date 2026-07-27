<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useAdminScheduleStore } from '../../stores/adminSchedule'
import { useNotificationsStore } from '../../stores/notifications'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useStudentFeedbackStore } from '../../stores/studentFeedback'
import { useAdminMonitoringStore } from '../../stores/adminMonitoring'
import AppShell from '../../components/AppShell.vue'
import type { RailItem } from '../../components/AppRail.vue'
import { initialsFrom } from '../../utils/initials'

const authStore = useAuthStore()
const adminStore = useAdminScheduleStore()
const notificationsStore = useNotificationsStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const monitoringStore = useAdminMonitoringStore()
const router = useRouter()

const displayName = computed(() => authStore.fullName || authStore.username || 'admin')
const initials = computed(() => initialsFrom(displayName.value))

const items = computed<RailItem[]>(() => [
  { to: '/admin/overview', label: 'Overview', icon: 'grid' },
  {
    to: '/admin/requests',
    label: 'Review & assign',
    icon: 'list',
    badge: adminStore.requests.length > 0,
  },
  { to: '/admin/people', label: 'People', icon: 'people' },
  { to: '/admin/reports', label: 'Reports & feedback', icon: 'book' },
  { to: '/admin/announcements', label: 'Inbox & alerts', icon: 'megaphone' },
  { to: '/admin/payments', label: 'Payments', icon: 'chart' },
])

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}

onMounted(async () => {
  await Promise.allSettled([
    monitoringStore.fetchOverview(),
    adminStore.fetchReviewLists(),
    notificationsStore.fetchMine(),
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
  ])
})
</script>

<template>
  <AppShell :items="items" :initials="initials" eyebrow="Admin" @logout="handleLogout" />
</template>
