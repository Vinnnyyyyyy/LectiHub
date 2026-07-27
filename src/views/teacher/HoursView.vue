<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCalendarStore } from '../../stores/calendar'
import CalendarPanel from '../../components/CalendarPanel.vue'
import CalendarConnectionsPanel from '../../components/CalendarConnectionsPanel.vue'
import TeacherAvailabilityPanel from '../../components/TeacherAvailabilityPanel.vue'

const calendarStore = useCalendarStore()
const { loading: loadingCalendar } = storeToRefs(calendarStore)
const calendarUpcoming = computed(() => calendarStore.upcoming)
</script>

<template>
  <section class="dash-section">
    <div class="dash-stack">
      <CalendarConnectionsPanel />
      <CalendarPanel
        title="My calendar"
        subtitle="Gold days mark your scheduled classes."
        empty-text="Nothing on this day yet."
        :events="calendarUpcoming"
        :loading="loadingCalendar"
      />
      <TeacherAvailabilityPanel />
    </div>
  </section>
</template>
