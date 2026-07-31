<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useClassesStore } from '../../stores/classes'
import { useLessonReportsStore } from '../../stores/lessonReports'
import { useStudentFeedbackStore } from '../../stores/studentFeedback'
import { useNotificationsStore } from '../../stores/notifications'
import { useCalendarStore } from '../../stores/calendar'
import { useAvailabilityStore } from '../../stores/availability'
import AppShell from '../../components/AppShell.vue'
import type { RailItem } from '../../components/AppRail.vue'
import ClassChatWidget from '../../components/ClassChatWidget.vue'
import { initialsFrom } from '../../utils/initials'

const authStore = useAuthStore()
const classesStore = useClassesStore()
const lessonReportsStore = useLessonReportsStore()
const studentFeedbackStore = useStudentFeedbackStore()
const notificationsStore = useNotificationsStore()
const calendarStore = useCalendarStore()
const availabilityStore = useAvailabilityStore()
const router = useRouter()

const displayName = computed(() => authStore.fullName || authStore.username || 'student')
const initials = computed(() => initialsFrom(displayName.value))

const items: RailItem[] = [
  { to: '/student/week', label: 'My week', icon: 'calendar' },
  { to: '/student/book', label: 'Book a class', icon: 'list' },
  { to: '/student/calendar', label: 'Calendar', icon: 'grid' },
  { to: '/student/homework', label: 'Homework & feedback', icon: 'book' },
  { to: '/student/payments', label: 'Payments', icon: 'chart' },
]

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}

onMounted(async () => {
  await Promise.allSettled([
    classesStore.fetchMine(),
    classesStore.fetchHistory(),
    lessonReportsStore.fetchMine(),
    studentFeedbackStore.fetchMine(),
    notificationsStore.fetchMine(),
    calendarStore.fetchMine(),
    availabilityStore.fetchOpen(),
  ])
})
</script>

<template>
  <AppShell
    :items="items"
    :initials="initials"
    :display-name="displayName"
    role-label="Student"
    eyebrow="Student"
    @logout="handleLogout"
  >
    <template #overlay>
      <ClassChatWidget />
    </template>
  </AppShell>
</template>
