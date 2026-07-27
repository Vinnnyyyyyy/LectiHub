<script setup lang="ts">
/**
 * LectiHub icon rail — 64px, one per role.
 * Icons are inline 16px-grid strokes; paths lifted verbatim from the design reference.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

type RailItem = {
  /** route path, e.g. '/admin/timetable' */
  to: string
  /** accessible label + tooltip */
  label: string
  /** key into ICONS */
  icon: keyof typeof ICONS
  /** show the amber attention dot */
  badge?: boolean
}

const props = defineProps<{
  items: RailItem[]
  initials: string
}>()

const route = useRoute()
const isActive = (to: string) => route.path === to || route.path.startsWith(to + '/')

const ICONS = {
  grid: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  calendar: '<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 2v2M10.5 2v2"/>',
  list: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/>',
  people:
    '<circle cx="6" cy="6" r="2.5"/><path d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M11 5.5a2 2 0 010 4M12.5 13.5c0-1.4-.4-2.4-1-3"/>',
  book: '<path d="M3 2.5h10v11H3z"/><path d="M6 6h4M6 9h4"/>',
  chart: '<path d="M2.5 13.5V9M6.5 13.5V4M10.5 13.5V7M14 13.5v-9"/>',
  megaphone: '<path d="M2.5 6.5l7-3v9l-7-3z"/><path d="M4.5 9.5v3M11.5 6a2.5 2.5 0 010 4"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1L3.5 12.5"/>',
} as const

const items = computed(() => props.items)
</script>

<template>
  <aside class="rail">
    <p class="wordmark">L</p>

    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="rail-item"
      :class="{ active: isActive(item.to) }"
      :title="item.label"
      :aria-label="item.label"
      :aria-current="isActive(item.to) ? 'page' : undefined"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        aria-hidden="true"
        v-html="ICONS[item.icon]"
      />
      <span v-if="item.badge" class="dot" aria-hidden="true" />
    </RouterLink>

    <button type="button" class="avatar" aria-label="Account menu">{{ initials }}</button>
  </aside>
</template>

<style scoped>
.rail {
  width: var(--lh-rail-w);
  align-self: stretch;
  flex: 0 0 var(--lh-rail-w);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 18px 0 14px;
  background: var(--lh-rail);
  border-right: 1px solid var(--lh-line);
}

.wordmark {
  height: 26px;
  margin: 0 0 14px;
  display: grid;
  place-items: center;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--lh-accent);
}

.rail-item {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: var(--lh-radius-item);
  display: grid;
  place-items: center;
  color: var(--lh-faint);
  transition:
    background var(--lh-ease),
    color var(--lh-ease);
}
.rail-item:hover {
  color: var(--lh-ink);
  background: var(--lh-bg-elevated);
}
.rail-item.active {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}
.rail-item:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lh-warm);
}

.avatar {
  margin-top: auto;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: var(--lh-chip);
  color: var(--lh-accent);
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
</style>
