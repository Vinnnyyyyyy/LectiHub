<script setup lang="ts">
/**
 * Role shell: rail + sticky header + routed pane.
 * Replaces the .dash-topbar tablist in Admin/Teacher/StudentDashboard.
 */
import AppRail from './AppRail.vue'

defineProps<{
  items: InstanceType<typeof AppRail>['$props']['items']
  initials: string
  eyebrow: string
  title: string
}>()
</script>

<template>
  <div class="frame">
    <AppRail :items="items" :initials="initials" />

    <div class="main">
      <header class="header">
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h1 class="title">{{ title }}</h1>
        </div>
        <div class="actions">
          <slot name="actions" />
        </div>
      </header>

      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.frame {
  display: flex;
  min-height: 100vh;
  background: var(--lh-bg);
  color: var(--lh-ink);
  overflow: hidden;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.header {
  position: sticky;
  top: 0;
  z-index: 20;
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 20px;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--lh-line);
  background: var(--lh-bg);
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
.actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 9px;
}
</style>
