<script setup lang="ts">
/**
 * Centered auth shell: form + optional aside in one framed composition.
 * Owns field/button styling so Login (and future auth pages) stay consistent.
 */
defineProps<{
  /** Small line under the wordmark. */
  centerName?: string
}>()
</script>

<template>
  <div class="auth">
    <div class="atmosphere" aria-hidden="true">
      <span class="glow glow-a" />
      <span class="glow glow-b" />
    </div>

    <div class="shell">
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
  </div>
</template>

<style scoped>
.auth {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  overflow: hidden;
  background: var(--lh-void, var(--lh-bg));
  color: var(--lh-ink);
}

.atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 55% 45% at 18% 20%, color-mix(in srgb, var(--lh-accent) 14%, transparent), transparent 70%),
    radial-gradient(ellipse 50% 40% at 88% 78%, color-mix(in srgb, var(--lh-accent) 8%, transparent), transparent 68%),
    var(--lh-void, var(--lh-bg));
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  opacity: 0.45;
  animation: float 14s ease-in-out infinite alternate;
}

.glow-a {
  width: min(42vw, 360px);
  height: min(42vw, 360px);
  top: -8%;
  left: -4%;
  background: color-mix(in srgb, var(--lh-accent) 22%, transparent);
}

.glow-b {
  width: min(36vw, 300px);
  height: min(36vw, 300px);
  right: -2%;
  bottom: -6%;
  background: color-mix(in srgb, var(--lh-accent) 14%, transparent);
  animation-delay: -5s;
  animation-duration: 18s;
}

@keyframes float {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(3%, 4%, 0) scale(1.06);
  }
}

.shell {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, 980px);
  min-height: min(640px, calc(100dvh - 64px));
  border-radius: calc(var(--lh-radius-panel) + 6px);
  background: color-mix(in srgb, var(--lh-panel) 92%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--lh-ink) 8%, transparent),
    0 28px 80px color-mix(in srgb, #000 45%, transparent);
  backdrop-filter: blur(18px);
  overflow: hidden;
  animation: rise 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.form-col {
  width: min(100%, 440px);
  flex: 0 0 min(100%, 440px);
  display: flex;
  flex-direction: column;
  padding: 40px 40px 36px;
  background: color-mix(in srgb, var(--lh-bg) 55%, transparent);
}

.brandblock {
  flex: 0 0 auto;
  animation: fade-up 0.55s ease 0.08s both;
}

.brand {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 28px;
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
  padding: 28px 0 8px;
  animation: fade-up 0.6s ease 0.16s both;
}

.side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 22px;
  padding: 44px 44px;
  border-left: 1px solid color-mix(in srgb, var(--lh-ink) 8%, transparent);
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--lh-accent) 7%, transparent),
      transparent 42%
    ),
    var(--lh-rail);
  animation: fade-up 0.65s ease 0.24s both;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Slotted form styling ───────────────────────────────── */

.form-body :deep(h1) {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(1.75rem, 2.4vw, 2.15rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.form-body :deep(.lede) {
  margin-top: 10px;
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--lh-muted);
}

.form-body :deep(form) {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 28px;
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
  transition:
    box-shadow var(--lh-ease),
    background var(--lh-ease),
    transform var(--lh-ease);
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
  box-shadow:
    inset 0 0 0 1px var(--lh-accent),
    0 0 0 3px color-mix(in srgb, var(--lh-accent) 16%, transparent);
}

.form-body :deep(.password-field) {
  position: relative;
}

.form-body :deep(.password-field input) {
  width: 100%;
  padding-right: 44px;
}

.form-body :deep(.password-toggle) {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: calc(var(--lh-radius-panel) - 4px);
  background: transparent;
  color: var(--lh-muted);
  cursor: pointer;
  transition:
    color var(--lh-ease),
    background var(--lh-ease);
}

.form-body :deep(.password-toggle:hover) {
  color: var(--lh-ink);
  background: color-mix(in srgb, var(--lh-ink) 6%, transparent);
}

.form-body :deep(.password-toggle:focus-visible) {
  outline: 0;
  color: var(--lh-ink);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lh-accent) 40%, transparent);
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
  transition:
    background var(--lh-ease),
    transform var(--lh-ease),
    box-shadow var(--lh-ease);
}

.form-body :deep(.submit:hover:not(:disabled)) {
  background: var(--lh-accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--lh-accent) 22%, transparent);
}

.form-body :deep(.submit:active:not(:disabled)) {
  transform: translateY(0);
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
  margin-top: 22px;
  font-size: 13.5px;
  color: var(--lh-muted);
}

.form-body :deep(.switch a) {
  color: var(--lh-accent);
  font-weight: 700;
  text-decoration: none;
  transition: color var(--lh-ease);
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

@media (max-width: 860px) {
  .auth {
    padding: 18px 14px;
    align-items: stretch;
  }

  .shell {
    flex-direction: column;
    min-height: auto;
    width: 100%;
  }

  .form-col {
    width: 100%;
    flex: 1 1 auto;
    padding: 28px 22px 22px;
  }

  .side {
    flex: 0 0 auto;
    border-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--lh-ink) 8%, transparent);
    padding: 28px 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .glow,
  .shell,
  .brandblock,
  .form-body,
  .side {
    animation: none !important;
  }

  .form-body :deep(.submit:hover:not(:disabled)) {
    transform: none;
  }
}
</style>
