<script setup lang="ts">
/**
 * LectiHub labeled sidebar — icon + text nav for each role (#73 design).
 * Supports route links (`to`) or in-page sections (`id` + activeId / select).
 * Mobile: bottom tab bar.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
  /** Stable id for section mode (and key). */
  id: string
  /** Optional route path; when set, item navigates instead of emitting select. */
  to?: string
  label: string
  icon: keyof typeof ICONS
  badge?: boolean
  /** Non-selectable group header (e.g. "Open hours & calendar"). */
  group?: boolean
  /** Indented child under a group. */
  child?: boolean
  /** When this group is clicked, select this child id. */
  defaultChildId?: string
  /** Child ids that mark this group as active. */
  childIds?: string[]
}

const props = withDefaults(
  defineProps<{
    items: RailItem[]
    initials: string
    displayName: string
    roleLabel: string
    /** Active section id when using section-based nav (dashboards). */
    activeId?: string | null
    /** Centre name from System settings (falls back to LectiHub). */
    brandName?: string
  }>(),
  { brandName: 'LectiHub' },
)

const emit = defineEmits<{
  logout: []
  select: [id: string]
}>()

const route = useRoute()

function isActive(item: RailItem) {
  if (item.group && item.childIds?.length && props.activeId) {
    return item.childIds.includes(props.activeId)
  }
  if (props.activeId != null && props.activeId !== '') {
    return props.activeId === item.id
  }
  if (!item.to) return false
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

function onSelect(item: RailItem) {
  if (item.to) return
  if (item.group) {
    emit('select', item.defaultChildId || item.childIds?.[0] || item.id)
    return
  }
  emit('select', item.id)
}

/** Child tabs stay hidden until their parent group is selected. */
const visibleItems = computed(() =>
  props.items.filter((item) => {
    if (!item.child) return true
    const group = props.items.find(
      (entry) => entry.group && entry.childIds?.includes(item.id),
    )
    if (!group?.childIds?.length) return true
    return Boolean(props.activeId && group.childIds.includes(props.activeId))
  }),
)

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
  <aside class="rail" aria-label="Main navigation">
    <div class="brand">
      <p class="wordmark">{{ brandName }}</p>
      <p class="role-chip">{{ roleLabel }}</p>
    </div>

    <nav class="nav">
      <component
        :is="item.to ? 'RouterLink' : 'button'"
        v-for="item in visibleItems"
        :key="item.id"
        v-bind="item.to ? { to: item.to } : { type: 'button' }"
        class="rail-item"
        :class="{
          active: isActive(item),
          child: item.child,
          group: item.group,
        }"
        :aria-label="item.label"
        :aria-current="isActive(item) && !item.group ? 'page' : undefined"
        :aria-expanded="item.group ? isActive(item) : undefined"
        @click="onSelect(item)"
      >
        <span class="icon-wrap" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            v-html="ICONS[item.icon]"
          />
        </span>
        <span class="rail-label">{{ item.label }}</span>
        <span v-if="item.badge" class="dot" aria-hidden="true" />
      </component>
    </nav>

    <div ref="menuRoot" class="account">
      <button
        type="button"
        class="account-btn"
        :aria-label="`${displayName}, ${roleLabel}. Account menu`"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <span class="avatar">{{ initials }}</span>
        <span class="account-copy">
          <span class="account-label">{{ displayName }}</span>
          <span class="account-hint">{{ roleLabel }} · Log out</span>
        </span>
      </button>

      <div v-if="menuOpen" class="menu" role="menu">
        <button type="button" role="menuitem" @click="emit('logout')">Log out</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  position: sticky;
  top: 0;
  width: var(--lh-rail-w);
  align-self: stretch;
  flex: 0 0 var(--lh-rail-w);
  min-height: 100vh;
  min-height: 100dvh;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.35rem 0.9rem 1rem;
  background: var(--lh-rail);
  border-right: 1px solid var(--lh-line);
  overflow: auto;
  scrollbar-gutter: stable;
  z-index: 30;
}

.brand {
  padding: 0 0.55rem 1.1rem;
}

.wordmark {
  margin: 0;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--lh-accent);
}

.role-chip {
  margin: 0.45rem 0 0;
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--lh-accent-edge);
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-family: 'Manrope', sans-serif;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.rail-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 2.65rem;
  padding: 0.55rem 0.7rem;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: transparent;
  color: var(--lh-faint);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    color var(--lh-ease);
}

.icon-wrap {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
}

.rail-label {
  min-width: 0;
  flex: 1;
  font-family: 'Manrope', sans-serif;
  font-size: 0.92rem;
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rail-item:hover {
  color: var(--lh-ink);
  background: var(--lh-bg-elevated);
}

.rail-item.active {
  color: var(--lh-ink);
  background: var(--lh-accent-soft);
}

.rail-item.active .icon-wrap {
  color: var(--lh-accent);
}

.rail-item.active .rail-label {
  color: var(--lh-ink);
}

.rail-item.group {
  margin-top: 0.35rem;
  color: var(--lh-muted);
}

.rail-item.group.active {
  background: transparent;
  color: var(--lh-accent);
}

.rail-item.group.active .icon-wrap,
.rail-item.group.active .rail-label {
  color: var(--lh-accent);
}

.rail-item.child {
  min-height: 2.25rem;
  margin-left: 0.55rem;
  padding-left: 0.85rem;
  border-left: 1px solid var(--lh-line);
  border-radius: 0 var(--lh-radius-item) var(--lh-radius-item) 0;
}

.rail-item.child .rail-label {
  font-size: 0.86rem;
}

.rail-item:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.dot {
  position: absolute;
  top: 0.7rem;
  right: 0.7rem;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lh-warm);
}

.account {
  position: relative;
  margin-top: auto;
  padding-top: 1.1rem;
  border-top: 1px solid var(--lh-line);
}

.account-btn {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.55rem 0.55rem;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: transparent;
  color: var(--lh-muted);
  text-align: left;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    color var(--lh-ease);
}

.account-btn:hover {
  background: var(--lh-bg-elevated);
  color: var(--lh-ink);
}

.account-btn:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--lh-chip);
  color: var(--lh-accent);
  font-family: 'Manrope', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
}

.account-copy {
  min-width: 0;
  display: grid;
  gap: 0.1rem;
}

.account-label {
  font-family: 'Manrope', sans-serif;
  font-size: 0.88rem;
  font-weight: 400;
  color: inherit;
}

.account-hint {
  font-family: 'Manrope', sans-serif;
  font-size: 0.72rem;
  color: var(--lh-dim);
}

.menu {
  position: absolute;
  bottom: calc(100% + 0.45rem);
  left: 0;
  right: 0;
  z-index: 40;
  padding: 0.3rem;
  border: 1px solid var(--lh-line-strong);
  border-radius: var(--lh-radius-item);
  background: var(--lh-bg-elevated);
  box-shadow: var(--lh-shadow);
}

.menu button {
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: transparent;
  color: var(--lh-ink);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 400;
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

@media (max-width: 820px) {
  .rail {
    position: fixed;
    z-index: 50;
    inset: auto 0 0 0;
    width: 100%;
    flex: 0 0 auto;
    flex-direction: row;
    align-items: stretch;
    gap: 0;
    padding: 0 6px calc(6px + env(safe-area-inset-bottom));
    border-right: 0;
    border-top: 1px solid var(--lh-line);
    height: auto;
  }

  .brand {
    display: none;
  }

  .nav {
    flex: 1;
    flex-direction: row;
    overflow-x: auto;
    gap: 0;
  }

  .rail-item {
    flex: 1 0 auto;
    width: auto;
    min-width: 4.25rem;
    min-height: 44px;
    margin-top: 6px;
    padding: 0.25rem 0.2rem;
    flex-direction: column;
    justify-content: center;
    gap: 0.2rem;
    border-radius: var(--lh-radius-control);
  }

  .rail-item.child {
    margin-left: 0;
    padding-left: 0.2rem;
    border-left: 0;
    border-radius: var(--lh-radius-control);
  }

  .rail-item.active {
    background: transparent;
  }

  .rail-item.active .rail-label {
    color: var(--lh-accent);
  }

  .rail-label {
    max-width: 100%;
    font-size: 0.62rem;
    font-weight: 400;
  }

  .dot {
    top: 2px;
    right: calc(50% - 16px);
  }

  .account {
    margin-top: 6px;
    padding: 0 6px 0 10px;
    border-top: 0;
    display: flex;
    align-items: center;
  }

  .account-copy {
    display: none;
  }

  .account-btn {
    width: auto;
    padding: 0;
  }

  .menu {
    bottom: calc(100% + 9px);
    left: auto;
    right: 0;
    width: 9rem;
  }
}
</style>
