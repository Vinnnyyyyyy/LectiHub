<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useClassesStore } from '../../stores/classes'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useNotificationsStore } from '../../stores/notifications'
import { useCalendarStore } from '../../stores/calendar'
import AppShell from '../../components/AppShell.vue'
import type { RailItem } from '../../components/AppRail.vue'
import ClassChatWidget from '../../components/ClassChatWidget.vue'
import { initialsFrom } from '../../utils/initials'

const authStore = useAuthStore()
const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const router = useRouter()

const displayName = computed(() => authStore.fullName || authStore.username || 'teacher')
const initials = computed(() => initialsFrom(displayName.value))

const items = computed<RailItem[]>(() => [
  { to: '/teacher/week', label: 'My teaching week', icon: 'calendar' },
  {
    to: '/teacher/session',
    label: 'In session',
    icon: 'clock',
    badge: classesStore.inProgress.length > 0,
  },
  { to: '/teacher/report', label: 'Lesson report', icon: 'list' },
  { to: '/teacher/records', label: 'Records', icon: 'book' },
  { to: '/teacher/hours', label: 'Open hours & calendar', icon: 'gear' },
])

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}

onMounted(async () => {
  await Promise.allSettled([
    classesStore.fetchMine(),
    classesStore.fetchHistory(),
    lessonReportsStore.fetchMine(),
    notificationsStore.fetchMine(),
    calendarStore.fetchMine(),
  ])
})
</script>

<template>
  <AppShell :items="items" :initials="initials" eyebrow="Teacher" @logout="handleLogout">
    <template #overlay>
      <ClassChatWidget />
    </template>
  </AppShell>
</template>
