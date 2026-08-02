<script setup lang="ts">
/**
 * System settings (admin 09). Edits buffer locally and save as a set;
 * the API reports which keys it actually applied.
 */
import { computed, onMounted, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore, type SettingsMap } from '../../stores/settings'
import { usePageEyebrow } from '../../composables/usePageMeta'

export type SettingsPanel = 'scheduling' | 'reminders' | 'meetings' | 'centre'

const props = withDefaults(
  defineProps<{
    /** Which settings group to show (sidebar sub-nav). */
    panel?: SettingsPanel
  }>(),
  { panel: 'scheduling' },
)

const settingsStore = useSettingsStore()
const { settings, loading, saving, error, message, ignored } = storeToRefs(settingsStore)

/** Working copy — nothing is written until Save. */
const draft = reactive<SettingsMap>({})

const TIME_KEYS = new Set([
  'scheduling.opening_time',
  'scheduling.closing_time',
  'scheduling.lunch_start',
  'scheduling.lunch_end',
])

/** Browsers often emit HH:MM:SS from <input type="time">; settings store HH:MM. */
function normalizeSettingValue(key: string, value: unknown): unknown {
  if (TIME_KEYS.has(key) && typeof value === 'string') {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`
    }
  }
  return value
}

function syncDraft() {
  for (const [key, value] of Object.entries(settings.value)) {
    const normalized = normalizeSettingValue(key, value)
    draft[key] = Array.isArray(normalized) ? [...normalized] : normalized
  }
}

watch(settings, syncDraft, { deep: true })

const dirty = computed(() =>
  Object.keys(settings.value).some((key) => {
    const left = normalizeSettingValue(key, draft[key])
    const right = normalizeSettingValue(key, settings.value[key])
    return JSON.stringify(left) !== JSON.stringify(right)
  }),
)

watch(dirty, (isDirty) => {
  if (isDirty) settingsStore.message = null
})

const emit = defineEmits<{ 'open-payments': [] }>()

usePageEyebrow(() => (draft['center.name'] as string) || 'Learning centre')

const SLOT_OPTIONS = [30, 60]
const REMINDER_OPTIONS = [
  { hours: 24, label: '24h' },
  { hours: 1, label: '1h' },
  { hours: 0.25, label: '15m' },
]
const PROVIDERS = [
  { id: 'google_meet', label: 'Google Meet' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'jitsi', label: 'Jitsi' },
  { id: 'digital_samba', label: 'Digital Samba' },
]

function reminderHours(): number[] {
  const value = draft['reminders.class_reminder_hours']
  return Array.isArray(value) ? (value as number[]) : []
}

function toggleReminder(hours: number) {
  const current = reminderHours()
  draft['reminders.class_reminder_hours'] = current.includes(hours)
    ? current.filter((h) => h !== hours)
    : [...current, hours].sort((a, b) => b - a)
}

function enabledProviders(): string[] {
  const value = draft['meetings.enabled_providers']
  return Array.isArray(value) ? (value as string[]) : []
}

function toggleProvider(id: string) {
  const current = enabledProviders()
  // The default provider cannot be switched off from under itself.
  if (current.includes(id) && draft['meetings.default_provider'] === id) return
  draft['meetings.enabled_providers'] = current.includes(id)
    ? current.filter((p) => p !== id)
    : [...current, id]
}

const TOGGLES: { key: string; label: string; note: string }[] = [
  {
    key: 'scheduling.auto_approve_single_match',
    label: 'Auto-approve when one teacher matches',
    note: 'Skips the review queue when exactly one teacher is free.',
  },
  {
    key: 'reminders.notify_on_decision',
    label: 'Notify on request approved or declined',
    note: '',
  },
  {
    key: 'reminders.notify_teacher_on_assignment',
    label: 'Notify teacher on assignment',
    note: '',
  },
  {
    key: 'reminders.request_feedback_after_report',
    label: 'Request feedback after a report is published',
    note: '',
  },
  { key: 'reminders.alert_admin_on_absence', label: 'Alert admin when marked absent', note: '' },
]

async function save() {
  const changes: SettingsMap = {}
  for (const key of Object.keys(settings.value)) {
    const left = normalizeSettingValue(key, draft[key])
    const right = normalizeSettingValue(key, settings.value[key])
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      changes[key] = left
    }
  }
  if (!Object.keys(changes).length) return

  try {
    await settingsStore.save(changes)
    syncDraft()
  } catch {
    // store surfaces the error
  }
}

function reset() {
  syncDraft()
}

onMounted(async () => {
  await settingsStore.fetchAll()
  syncDraft()
})
</script>

<template>
  <section class="settings">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>
    <p v-if="ignored.length" class="banner warn" role="alert">
      Not saved: {{ ignored.join(', ') }} — unknown or the wrong type.
    </p>

    <div class="bar">
      <p class="bar-note">
        {{
          error
            ? 'Settings could not be loaded from the server.'
            : dirty
              ? 'You have unsaved changes.'
              : 'Everything is saved.'
        }}
      </p>
      <button type="button" class="btn-ghost" :disabled="!dirty || !!error" @click="reset">
        Discard
      </button>
      <button
        type="button"
        class="btn-primary"
        :disabled="!dirty || saving || !!error"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save changes' }}
      </button>
    </div>

    <p v-if="loading" class="empty">Loading settings…</p>
    <p v-else-if="error && !Object.keys(draft).length" class="empty">
      Run <code>php artisan migrate</code> in <code>LectiHub-api</code>, then refresh this page.
    </p>

    <div v-else class="groups">
      <!-- Scheduling -->
      <section v-show="panel === 'scheduling'" class="group">
        <div class="group-head">
          <h2>Scheduling rules</h2>
          <p class="group-note">Governs which slots students can request.</p>
        </div>

        <div class="rows">
          <div class="row">
            <p class="row-label">Slot length</p>
            <div class="segmented">
              <button
                v-for="option in SLOT_OPTIONS"
                :key="option"
                type="button"
                class="seg"
                :class="{ active: draft['scheduling.slot_minutes'] === option }"
                @click="draft['scheduling.slot_minutes'] = option"
              >
                {{ option }} min
              </button>
            </div>
          </div>

          <div class="row">
            <p class="row-label">Opening hours</p>
            <div class="pair">
              <input v-model="draft['scheduling.opening_time']" type="time" />
              <span class="dash">–</span>
              <input v-model="draft['scheduling.closing_time']" type="time" />
            </div>
          </div>

          <div class="row">
            <p class="row-label">Lunch gap</p>
            <div class="pair">
              <input v-model="draft['scheduling.lunch_start']" type="time" />
              <span class="dash">–</span>
              <input v-model="draft['scheduling.lunch_end']" type="time" />
            </div>
          </div>

          <div class="row">
            <p class="row-label">Minimum notice for a request</p>
            <div class="pair">
              <input
                v-model.number="draft['scheduling.min_notice_hours']"
                type="number"
                min="0"
                class="narrow"
              />
              <span class="unit">hours</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Reminders -->
      <section v-show="panel === 'reminders'" class="group">
        <div class="group-head">
          <h2>Reminders &amp; notifications</h2>
          <p class="group-note">When the system contacts students and teachers.</p>
        </div>

        <div class="rows">
          <div class="row">
            <p class="row-label">Class reminders</p>
            <div class="segmented">
              <button
                v-for="option in REMINDER_OPTIONS"
                :key="option.hours"
                type="button"
                class="seg"
                :class="{ active: reminderHours().includes(option.hours) }"
                @click="toggleReminder(option.hours)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <label v-for="toggle in TOGGLES" :key="toggle.key" class="row toggle">
            <div class="toggle-copy">
              <p class="row-label">{{ toggle.label }}</p>
              <p v-if="toggle.note" class="row-note">{{ toggle.note }}</p>
            </div>
            <input v-model="draft[toggle.key]" type="checkbox" />
          </label>
        </div>
      </section>

      <!-- Meetings -->
      <section v-show="panel === 'meetings'" class="group">
        <div class="group-head">
          <h2>Meeting providers</h2>
          <p class="group-note">Default platform for new classes.</p>
        </div>

        <div class="rows">
          <div v-for="provider in PROVIDERS" :key="provider.id" class="row provider">
            <p class="row-label">{{ provider.label }}</p>
            <span v-if="draft['meetings.default_provider'] === provider.id" class="chip">
              Default
            </span>
            <button
              v-else-if="enabledProviders().includes(provider.id)"
              type="button"
              class="btn-text"
              @click="draft['meetings.default_provider'] = provider.id"
            >
              Make default
            </button>
            <input
              type="checkbox"
              :checked="enabledProviders().includes(provider.id)"
              :disabled="draft['meetings.default_provider'] === provider.id"
              @change="toggleProvider(provider.id)"
            />
          </div>
        </div>
      </section>

      <!-- Centre -->
      <section v-show="panel === 'centre'" class="group">
        <div class="group-head">
          <h2>Centre profile &amp; records</h2>
          <p class="group-note">Applies to announcements, reports and exports.</p>
        </div>

        <div class="rows">
          <div class="row">
            <p class="row-label">Centre name</p>
            <input v-model="draft['center.name']" type="text" class="wide" />
          </div>
          <div class="row">
            <p class="row-label">Time zone</p>
            <input v-model="draft['center.timezone']" type="text" class="wide" />
          </div>
          <div class="row">
            <p class="row-label">Term dates</p>
            <div class="pair">
              <input v-model="draft['center.term_start']" type="date" />
              <span class="dash">–</span>
              <input v-model="draft['center.term_end']" type="date" />
            </div>
          </div>
          <div class="row">
            <p class="row-label">Audit retention</p>
            <div class="pair">
              <input
                v-model.number="draft['records.audit_retention_months']"
                type="number"
                min="1"
                class="narrow"
              />
              <span class="unit">months</span>
            </div>
          </div>

          <div class="row">
            <div class="toggle-copy">
              <p class="row-label">Billing &amp; receipts</p>
              <p class="row-note">Record payments and confirm student receipts.</p>
            </div>
            <button type="button" class="btn-ghost link" @click="emit('open-payments')">
              Open payments
            </button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  width: 100%;
  max-width: 60rem;
  margin-inline: auto;
}

.banner {
  padding: 9px 12px;
  border-radius: var(--lh-radius-control);
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 12.5px;
}

.banner.error {
  background: var(--lh-danger-soft);
  color: var(--lh-danger);
}

.banner.warn {
  background: var(--lh-warm-soft);
  color: var(--lh-warm);
}

.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 0;
  background: var(--lh-bg);
}

.bar-note {
  font-size: 12px;
  color: var(--lh-dim);
}

.btn-primary,
.btn-ghost {
  height: 31px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--lh-radius-control);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--lh-ease);
}

.btn-primary {
  margin-left: auto;
  background: var(--lh-accent);
  color: var(--lh-on-accent);
  font-weight: 800;
}

.btn-primary:hover:not(:disabled) {
  background: var(--lh-accent-hover);
}

.btn-ghost {
  margin-left: auto;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
}

.btn-primary + .btn-ghost,
.btn-ghost + .btn-primary {
  margin-left: 0;
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary:focus-visible,
.btn-ghost:focus-visible,
.btn-text:focus-visible,
.seg:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.group {
  padding: 18px 20px;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.group-head h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 19px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.group-note {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

.rows {
  margin-top: 14px;
}

.row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 13px 0;
  border-top: 1px solid var(--lh-line);
}

.row.toggle,
.row.provider {
  cursor: pointer;
}

.row-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.row-note {
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--lh-dim);
}

.toggle-copy {
  flex: 1;
  min-width: 0;
}

.segmented {
  display: flex;
  gap: 6px;
}

.seg {
  height: 31px;
  padding: 0 13px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    color var(--lh-ease);
}

.seg.active {
  background: var(--lh-accent);
  box-shadow: none;
  color: var(--lh-on-accent);
  font-weight: 800;
}

.pair {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dash,
.unit {
  font-size: 12px;
  color: var(--lh-dim);
}

input[type='time'],
input[type='date'],
input[type='number'],
input[type='text'] {
  height: 34px;
  padding: 0 11px;
  border: 0;
  border-radius: var(--lh-radius-control);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 12.5px;
}

input.narrow {
  width: 5rem;
}

input.wide {
  width: 18rem;
}

input[type='time']:focus,
input[type='date']:focus,
input[type='number']:focus,
input[type='text']:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

input[type='checkbox'] {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  accent-color: var(--lh-accent);
}

.chip {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--lh-accent-soft);
  color: var(--lh-accent);
  font-size: 10.5px;
  font-weight: 700;
}

.btn-text {
  border: 0;
  background: transparent;
  color: var(--lh-accent);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.btn-ghost.link {
  display: inline-flex;
  align-items: center;
  margin-left: 0;
  color: var(--lh-accent);
  text-decoration: none;
}

.empty {
  padding: 24px 0;
  font-size: 12.5px;
  color: var(--lh-muted);
}
</style>
