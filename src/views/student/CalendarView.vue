<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCalendarStore } from '../../stores/calendar'
import { useAvailabilityStore } from '../../stores/availability'
import CalendarPanel from '../../components/CalendarPanel.vue'

const calendarStore = useCalendarStore()
const availabilityStore = useAvailabilityStore()

const { loading: loadingCalendar } = storeToRefs(calendarStore)
const { openDates } = storeToRefs(availabilityStore)
const calendarUpcoming = computed(() => calendarStore.upcoming)
</script>

<template>
  <section class="dash-section">
    <CalendarPanel
      title="My calendar"
      subtitle="Gold days mark scheduled classes or open teacher availability."
      empty-text="Nothing on this day yet."
      :events="calendarUpcoming"
      :loading="loadingCalendar"
      :highlight-dates="openDates"
      highlight-label="Teachers available"
    />
  </section>
</template>
