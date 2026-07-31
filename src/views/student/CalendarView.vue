<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import CalendarPanel from '../../components/CalendarPanel.vue'
import { useCalendarStore } from '../../stores/calendar'
import { useAvailabilityStore } from '../../stores/availability'
import { usePageEyebrow } from '../../composables/usePageMeta'

const calendarStore = useCalendarStore()
const availabilityStore = useAvailabilityStore()

const { loading: loadingCalendar } = storeToRefs(calendarStore)
const { openDates } = storeToRefs(availabilityStore)

const calendarUpcoming = computed(() => calendarStore.upcoming)
const openHighlightDates = computed(() => openDates.value)

usePageEyebrow(() => {
  const count = calendarUpcoming.value.length
  return count
    ? `${count} upcoming class${count === 1 ? '' : 'es'}`
    : 'Month and year view of your classes'
})

onMounted(async () => {
  await Promise.allSettled([calendarStore.fetchMine(), availabilityStore.fetchOpen()])
})
</script>

<template>
  <CalendarPanel
    title="My calendar"
    subtitle="Gold days mark scheduled classes or open teacher availability."
    empty-text="Nothing on this day yet."
    :events="calendarUpcoming"
    :loading="loadingCalendar"
    :highlight-dates="openHighlightDates"
    highlight-label="Teachers available"
  />
</template>
