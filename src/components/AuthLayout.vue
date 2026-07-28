<script setup lang="ts">
/**
 * Split auth shell: form column on --lh-bg, flat panel on --lh-rail.
 * Owns the field/button styling so Login, Register and Free trial stay
 * consistent — slotted markup is styled through :deep().
 */
defineProps<{
  /** Small line under the wordmark. */
  centerName?: string
}>()
</script>

<template>
  <div class="auth">
    <div class="form-col">
      <header class="brandblock">
        <p class="brand">LectiHub</p>
        <p v-if="centerName" class="center">{{ centerName }}</p>
      </header>

      <div class="form-body">
        <slot />
      </div>
    </div>

    <aside class="side">
      <slot name="aside" />
    </aside>
  </div>
</template>

<style scoped>
.auth {
  display: flex;
  min-height: 100vh;
  background: var(--lh-bg);
  color: var(--lh-ink);
}

.form-col {
  width: 560px;
  flex: 0 0 560px;
  display: flex;
  flex-direction: column;
  padding: 52px 60px;
}

.brandblock {
  flex: 0 0 auto;
}

.brand {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--lh-accent);
}

.center {
  margin-top: 6px;
  font-size: 12px;
  color: var(--lh-dim);
}

.form-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
  padding: 32px 0;
}

.side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 26px;
  padding: 52px 56px;
  border-left: 1px solid var(--lh-line);
  background: var(--lh-rail);
}

/* ── Slotted form styling ───────────────────────────────── */

.form-body :deep(h1) {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 38px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.form-body :deep(.lede) {
  margin-top: 12px;
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--lh-muted);
}

.form-body :deep(form) {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 32px;
}

.form-body :deep(.field) {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.form-body :deep(.field-head) {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 9px;
}

.form-body :deep(label) {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.form-body :deep(input),
.form-body :deep(select),
.form-body :deep(textarea) {
  height: 46px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-strong);
  color: var(--lh-ink);
  font: inherit;
  font-size: 14.5px;
  transition: box-shadow var(--lh-ease);
}

.form-body :deep(textarea) {
  height: auto;
  min-height: 92px;
  padding: 12px 14px;
  line-height: 1.5;
  resize: vertical;
}

.form-body :deep(input::placeholder),
.form-body :deep(textarea::placeholder) {
  color: var(--lh-ghost);
}

.form-body :deep(input:focus),
.form-body :deep(select:focus),
.form-body :deep(textarea:focus) {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.form-body :deep(.submit) {
  height: 48px;
  margin-top: 8px;
  border: 0;
  border-radius: var(--lh-radius-panel);
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.form-body :deep(.submit:hover:not(:disabled)) {
  background: var(--lh-accent-hover);
}

.form-body :deep(.submit:disabled) {
  opacity: 0.6;
  cursor: progress;
}

.form-body :deep(.submit:focus-visible) {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent-hover);
}

.form-body :deep(.checkline) {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--lh-muted);
}

.form-body :deep(.checkline input) {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  padding: 0;
  accent-color: var(--lh-accent);
  box-shadow: none;
}

.form-body :deep(.switch) {
  margin-top: 26px;
  font-size: 13.5px;
  color: var(--lh-muted);
}

.form-body :deep(.switch a) {
  color: var(--lh-accent);
  font-weight: 700;
  text-decoration: none;
}

.form-body :deep(.switch a:hover) {
  color: var(--lh-accent-hover);
}

.form-body :deep(.note) {
  margin-top: 14px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--lh-ghost);
}

.form-body :deep(.error) {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
  font-size: 12.5px;
}

@media (max-width: 940px) {
  .auth {
    flex-direction: column;
  }

  .form-col {
    width: 100%;
    flex: 1 1 auto;
    padding: 32px 22px;
  }

  .side {
    flex: 0 0 auto;
    border-left: 0;
    border-top: 1px solid var(--lh-line);
    padding: 32px 22px;
  }
}
</style>
