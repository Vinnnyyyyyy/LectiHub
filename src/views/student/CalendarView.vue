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
const { openDates, openByDate, timeSlots } = storeToRefs(availabilityStore)

const calendarUpcoming = computed(() => calendarStore.upcoming)
const openHighlightDates = computed(() => openDates.value)
const openSlotsByDate = computed(() => {
  const map: Record<string, string[]> = {}
  for (const [date, slots] of Object.entries(openByDate.value)) {
    map[date] = slots.map((slot) => slot.timeSlot)
  }
  return map
})

usePageEyebrow(() => {
  const count = calendarUpcoming.value.length
  return count
    ? `${count} upcoming class${count === 1 ? '' : 'es'}`
    : 'Day, month, and year view of your classes'
})

onMounted(async () => {
  await Promise.allSettled([calendarStore.fetchMine(), availabilityStore.fetchOpen()])
})
</script>

<template>
  <CalendarPanel
    title="My calendar"
    subtitle="Use day view to see vacant open slots vs your booked classes."
    empty-text="Nothing on this day yet."
    :events="calendarUpcoming"
    :loading="loadingCalendar"
    :highlight-dates="openHighlightDates"
    highlight-label="Teachers available"
    :time-slots="timeSlots"
    :open-slots-by-date="openSlotsByDate"
  />
</template>
