<script setup lang="ts">
/**
 * Role shell: rail + sticky header + routed pane.
 * Replaces the .dash-topbar tablist in Admin/Teacher/StudentDashboard.
 * Header copy comes from the active child route's meta.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppRail, { type RailItem } from './AppRail.vue'
import { usePageMeta } from '../composables/usePageMeta'

const props = defineProps<{
  items: RailItem[]
  initials: string
  /** fallback eyebrow when neither the view nor the route supplies one */
  eyebrow: string
}>()

const emit = defineEmits<{ logout: [] }>()

const route = useRoute()
const { eyebrowOverride, titleOverride } = usePageMeta()

const eyebrow = computed(
  () => eyebrowOverride.value ?? (route.meta.eyebrow as string | undefined) ?? props.eyebrow,
)
const title = computed(() => titleOverride.value ?? (route.meta.title as string | undefined) ?? '')
const intro = computed(() => (route.meta.intro as string | undefined) ?? '')
</script>

<template>
  <div class="frame">
    <AppRail :items="items" :initials="initials" @logout="emit('logout')" />

    <div class="main">
      <header class="header">
        <div class="content">
          <div class="head-copy">
            <p class="eyebrow">{{ eyebrow }}</p>
            <h1 class="title">{{ title }}</h1>
            <p v-if="intro" class="intro">{{ intro }}</p>
          </div>
          <div class="actions">
            <slot name="actions" />
          </div>
        </div>
      </header>

      <main class="pane">
        <div class="content">
          <RouterView />
        </div>
      </main>
    </div>

    <slot name="overlay" />
  </div>
</template>

<style scoped>
.frame {
  display: flex;
  min-height: 100vh;
  background: var(--lh-bg);
  color: var(--lh-ink);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Shared width so header + pane sit as one middle column. */
.content {
  width: min(100%, 72rem);
  margin-inline: auto;
  min-width: 0;
}

.header {
  position: sticky;
  top: 0;
  z-index: 20;
  flex: 0 0 auto;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--lh-line);
  background: var(--lh-bg);
}

.header .content {
  display: flex;
  align-items: flex-end;
  gap: 22px;
}

.head-copy {
  min-width: 0;
}

.eyebrow {
  margin: 0;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.title {
  margin: 7px 0 0;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 29px;
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1;
}

.intro {
  margin: 7px 0 0;
  max-width: 44rem;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 9px;
}

.pane {
  flex: 1;
  min-width: 0;
  padding: 22px 24px 44px;
}

@media (max-width: 820px) {
  /* The rail is a fixed bottom tab bar at this width. */
  .frame {
    flex-direction: column;
  }

  .header {
    padding: 14px 14px 12px;
  }

  .title {
    font-size: 24px;
  }

  .pane {
    /* Clear the 56px bar plus the safe area. */
    padding: 18px 14px calc(74px + env(safe-area-inset-bottom));
  }
}
</style>
