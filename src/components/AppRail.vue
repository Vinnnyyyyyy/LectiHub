<script setup lang="ts">
/**
 * LectiHub icon rail — 64px, one per role.
 * Icons are inline 16px-grid strokes; paths lifted verbatim from the design reference.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const ICONS = {
  grid: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  calendar:
    '<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 2v2M10.5 2v2"/>',
  list: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/>',
  people:
    '<circle cx="6" cy="6" r="2.5"/><path d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M11 5.5a2 2 0 010 4M12.5 13.5c0-1.4-.4-2.4-1-3"/>',
  book: '<path d="M3 2.5h10v11H3z"/><path d="M6 6h4M6 9h4"/>',
  chart: '<path d="M2.5 13.5V9M6.5 13.5V4M10.5 13.5V7M14 13.5v-9"/>',
  megaphone: '<path d="M2.5 6.5l7-3v9l-7-3z"/><path d="M4.5 9.5v3M11.5 6a2.5 2.5 0 010 4"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1L3.5 12.5"/>',
} as const

export type RailItem = {
  /** route path, e.g. '/admin/requests' */
  to: string
  /** accessible label + tooltip */
  label: string
  icon: keyof typeof ICONS
  /** show the amber attention dot */
  badge?: boolean
}

defineProps<{
  items: RailItem[]
  initials: string
}>()

const emit = defineEmits<{ logout: [] }>()

const route = useRoute()
const isActive = (to: string) => route.path === to || route.path.startsWith(to + '/')

const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return
  if (menuRoot.value && !menuRoot.value.contains(event.target as Node)) {
    menuOpen.value = false
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
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

    <div ref="menuRoot" class="account">
      <button
        type="button"
        class="avatar"
        aria-label="Account menu"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        {{ initials }}
      </button>

      <div v-if="menuOpen" class="menu" role="menu">
        <button type="button" role="menuitem" @click="emit('logout')">Log out</button>
      </div>
    </div>
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

.account {
  position: relative;
  margin-top: auto;
}

.avatar {
  display: grid;
  place-items: center;
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

.avatar:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.menu {
  position: absolute;
  bottom: 0;
  left: calc(100% + 9px);
  z-index: 40;
  min-width: 8.5rem;
  padding: 5px;
  border: 1px solid var(--lh-line-strong);
  border-radius: var(--lh-radius-item);
  background: var(--lh-bg-elevated);
  box-shadow: var(--lh-shadow);
}

.menu button {
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: transparent;
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.menu button:hover {
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
}

.menu button:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}
</style>
