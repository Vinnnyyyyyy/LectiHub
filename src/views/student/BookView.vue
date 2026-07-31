<script setup lang="ts">
import ScheduleBookingSection from '../../components/ScheduleBookingSection.vue'
import { usePageEyebrow } from '../../composables/usePageMeta'

usePageEyebrow(() => 'Pick dates and times from the calendar')
</script>

<template>
  <ScheduleBookingSection />
</template>
