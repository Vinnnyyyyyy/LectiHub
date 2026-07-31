<script setup lang="ts">
/**
 * Announcements (admin 07). Compose with audience targeting on the left,
 * scheduled and sent alongside. The reach count comes from the API rather
 * than being guessed, so the send button can say what it will actually do.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  useAnnouncementsStore,
  type Announcement,
  type AudienceType,
} from '../../stores/announcements'
import { useCoursesStore } from '../../stores/courses'
import { useUsersStore } from '../../stores/users'
import { formatDateTime, relativeTime } from '../../utils/datetime'
import { usePageEyebrow } from '../../composables/usePageMeta'

const store = useAnnouncementsStore()
const coursesStore = useCoursesStore()
const usersStore = useUsersStore()

// The lists are read through the store's getters (sent / drafts / scheduled).
const { previewCount, loading, submitting, error, message } = storeToRefs(store)
const { courses } = storeToRefs(coursesStore)
const { users } = storeToRefs(usersStore)

const AUDIENCES: { id: AudienceType; label: string }[] = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'students', label: 'All students' },
  { id: 'teachers', label: 'All teachers' },
  { id: 'course', label: 'By course' },
  { id: 'people', label: 'Specific people' },
]

const TEMPLATES = [
  {
    label: 'Closure notice',
    hint: 'Dates + rescheduling note',
    subject: 'Holiday closures',
    body: 'The centre will be closed on the dates below. Any classes already booked in that window have been moved — check your calendar and let us know if the new time does not work.',
  },
  {
    label: 'Booking reminder',
    hint: 'Nudge students with no slots',
    subject: 'Book your next class',
    body: 'You have no classes booked yet this term. Pick up to three times that suit you and we will confirm a teacher, usually within a day.',
  },
  {
    label: 'New teacher intro',
    hint: 'Subject and open hours',
    subject: 'A new teacher has joined',
    body: 'Please welcome our newest teacher. Their subject and open hours are listed on the booking screen from today.',
  },
  {
    label: 'Report deadline',
    hint: 'Teachers with overdue reports',
    subject: 'Lesson reports due',
    body: 'A few lesson reports are still outstanding. A class cannot archive until the report is filed and the student has replied.',
  },
]

const draft = ref({
  subject: '',
  body: '',
  audienceType: 'students' as AudienceType,
  courseId: '' as number | '',
  userIds: [] as number[],
  sendEmail: false,
  scheduledFor: '',
})

const people = computed(() => users.value.filter((user) => user.role !== 'admin'))

const canSend = computed(
  () => draft.value.subject.trim().length > 0 && draft.value.body.trim().length > 0,
)

/** Ask the API what the current audience actually reaches. */
async function refreshPreview() {
  await store.preview({
    audienceType: draft.value.audienceType,
    courseId: draft.value.courseId === '' ? null : Number(draft.value.courseId),
    userIds: draft.value.userIds,
  })
}

watch(
  () => [draft.value.audienceType, draft.value.courseId, draft.value.userIds.length],
  refreshPreview,
)

usePageEyebrow(() => {
  const sent = store.sent.length
  return sent ? `${sent} sent · ${store.scheduled.length} scheduled` : 'Nothing sent yet'
})

function applyTemplate(template: (typeof TEMPLATES)[number]) {
  draft.value.subject = template.subject
  draft.value.body = template.body
}

function togglePerson(id: number) {
  const current = draft.value.userIds
  draft.value.userIds = current.includes(id)
    ? current.filter((entry) => entry !== id)
    : [...current, id]
}

function reset() {
  draft.value = {
    subject: '',
    body: '',
    audienceType: 'students',
    courseId: '',
    userIds: [],
    sendEmail: false,
    scheduledFor: '',
  }
}

async function submit(send: boolean) {
  if (!canSend.value) return
  if (draft.value.audienceType === 'course' && draft.value.courseId === '') return

  try {
    await store.create({
      subject: draft.value.subject.trim(),
      body: draft.value.body.trim(),
      audienceType: draft.value.audienceType,
      courseId: draft.value.courseId === '' ? null : Number(draft.value.courseId),
      userIds: draft.value.userIds,
      sendEmail: draft.value.sendEmail,
      scheduledFor: draft.value.scheduledFor || null,
      send,
    })
    reset()
    await refreshPreview()
  } catch {
    // store surfaces the error
  }
}

function audienceLabel(item: Announcement) {
  if (item.audienceType === 'course') return item.course?.title ?? 'A course'
  return AUDIENCES.find((a) => a.id === item.audienceType)?.label ?? item.audienceType
}

const sendLabel = computed(() => {
  if (draft.value.scheduledFor) return 'Schedule'
  if (previewCount.value === null) return 'Send'
  const noun =
    draft.value.audienceType === 'students'
      ? 'student'
      : draft.value.audienceType === 'teachers'
        ? 'teacher'
        : 'person'
  return `Send to ${previewCount.value} ${noun}${previewCount.value === 1 ? '' : 's'}`
})

onMounted(async () => {
  await Promise.allSettled([store.fetchAll(), coursesStore.fetchAll(), usersStore.fetchAll()])
  await refreshPreview()
})
</script>

<template>
  <section class="announce">
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <p v-if="error" class="banner error" role="alert">{{ error }}</p>

    <div class="split">
      <!-- Compose -->
      <div class="compose">
        <div class="block">
          <p class="block-label">Audience</p>
          <div class="chips">
            <button
              v-for="item in AUDIENCES"
              :key="item.id"
              type="button"
              class="chip"
              :class="{ active: draft.audienceType === item.id }"
              @click="draft.audienceType = item.id"
            >
              {{ item.label }}
            </button>
          </div>

          <select
            v-if="draft.audienceType === 'course'"
            v-model="draft.courseId"
            class="course-select"
          >
            <option value="">Pick a course…</option>
            <option v-for="course in courses" :key="course.id" :value="course.id">
              {{ course.title }} · {{ course.studentCount }} enrolled
            </option>
          </select>

          <div v-if="draft.audienceType === 'people'" class="people">
            <label v-for="person in people" :key="person.id" class="person">
              <input
                type="checkbox"
                :checked="draft.userIds.includes(person.id)"
                @change="togglePerson(person.id)"
              />
              <span class="person-name">{{ person.fullName }}</span>
              <span class="person-role">{{ person.role }}</span>
            </label>
          </div>
        </div>

        <div class="block">
          <label class="block-label" for="subject">Subject</label>
          <input
            id="subject"
            v-model="draft.subject"
            type="text"
            placeholder="August schedule — holiday closures"
          />
        </div>

        <div class="block">
          <label class="block-label" for="body">Message</label>
          <textarea
            id="body"
            v-model="draft.body"
            rows="6"
            placeholder="What everyone needs to know, and what to do about it."
          />
        </div>

        <div class="block options">
          <label class="checkline">
            <input v-model="draft.sendEmail" type="checkbox" />
            Also send by email
          </label>

          <label class="schedule">
            <span class="schedule-label">Schedule for</span>
            <input v-model="draft.scheduledFor" type="datetime-local" />
          </label>
        </div>

        <div class="actions">
          <button
            type="button"
            class="btn-ghost"
            :disabled="!canSend || submitting"
            @click="submit(false)"
          >
            Save draft
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!canSend || submitting"
            @click="submit(true)"
          >
            {{ submitting ? 'Sending…' : sendLabel }}
          </button>
        </div>

        <div class="templates">
          <p class="block-label">Start from a template</p>
          <div class="template-grid">
            <button
              v-for="template in TEMPLATES"
              :key="template.label"
              type="button"
              class="template"
              @click="applyTemplate(template)"
            >
              <span class="template-name">{{ template.label }}</span>
              <span class="template-hint">{{ template.hint }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Sent & scheduled -->
      <aside class="side">
        <div v-if="store.scheduled.length" class="panel">
          <p class="block-label">Scheduled</p>
          <div v-for="item in store.scheduled" :key="item.id" class="sched">
            <p class="sched-subject">{{ item.subject }}</p>
            <p class="sched-when">
              Goes out {{ item.scheduledFor ? formatDateTime(item.scheduledFor) : '' }} to
              {{ audienceLabel(item).toLowerCase() }}
            </p>
            <div class="sched-actions">
              <button type="button" class="btn-text" @click="store.send(item.id)">Send now</button>
              <button type="button" class="btn-text danger" @click="store.remove(item.id)">
                Delete
              </button>
            </div>
          </div>
        </div>

        <div v-if="store.drafts.length" class="panel">
          <p class="block-label">Drafts</p>
          <div v-for="item in store.drafts" :key="item.id" class="sched">
            <p class="sched-subject">{{ item.subject }}</p>
            <p class="sched-when">{{ audienceLabel(item) }} · not sent</p>
            <div class="sched-actions">
              <button type="button" class="btn-text" @click="store.send(item.id)">Send</button>
              <button type="button" class="btn-text danger" @click="store.remove(item.id)">
                Delete
              </button>
            </div>
          </div>
        </div>

        <div class="panel">
          <p class="block-label">Sent</p>

          <p v-if="loading" class="empty small">Loading…</p>
          <p v-else-if="!store.sent.length" class="empty small">Nothing sent yet.</p>

          <article v-for="item in store.sent" v-else :key="item.id" class="sent">
            <div class="sent-head">
              <p class="sent-subject">{{ item.subject }}</p>
              <p class="sent-when">{{ relativeTime(item.sentAt) }}</p>
            </div>
            <p class="sent-body">{{ item.body }}</p>
            <p class="sent-meta">
              {{ audienceLabel(item) }} · {{ item.recipientCount }} recipient{{
                item.recipientCount === 1 ? '' : 's'
              }}
              <span v-if="item.recipientCount" class="read">{{ item.readCount }} read</span>
            </p>
          </article>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.announce {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
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

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 26px;
  align-items: start;
}

.compose {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  padding: 20px 22px;
  border-radius: var(--lh-radius-frame);
  background: var(--lh-rail);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.block-label {
  display: block;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lh-dim);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chip {
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--lh-ease),
    color var(--lh-ease);
}

.chip.active {
  background: var(--lh-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
  color: var(--lh-accent);
  font-weight: 700;
}

.course-select,
input[type='text'],
input[type='datetime-local'],
textarea {
  width: 100%;
  margin-top: 10px;
  padding: 11px 12px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: var(--lh-input);
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
}

input[type='text'],
.course-select {
  height: 40px;
  padding: 0 12px;
}

textarea {
  resize: vertical;
}

textarea::placeholder,
input::placeholder {
  color: var(--lh-ghost);
}

.course-select:focus,
input:focus,
textarea:focus {
  outline: 0;
  box-shadow: inset 0 0 0 1px var(--lh-accent);
}

.people {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  max-height: 14rem;
  overflow-y: auto;
  border-radius: var(--lh-radius-item);
  box-shadow: inset 0 0 0 1px var(--lh-line);
}

.person {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--lh-line);
  font-size: 12.5px;
  cursor: pointer;
}

.person:last-child {
  border-bottom: 0;
}

.person input {
  width: 15px;
  height: 15px;
  accent-color: var(--lh-accent);
}

.person-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-role {
  font-size: 10.5px;
  color: var(--lh-dim);
  text-transform: capitalize;
}

.options {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.checkline {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  color: var(--lh-muted);
}

.checkline input {
  width: 15px;
  height: 15px;
  accent-color: var(--lh-accent);
}

.schedule {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-left: auto;
}

.schedule-label {
  font-size: 11.5px;
  color: var(--lh-dim);
}

.schedule input {
  width: auto;
  height: 34px;
  margin-top: 0;
  padding: 0 10px;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 9px;
}

.btn-primary,
.btn-ghost {
  height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--lh-radius-control);
  font: inherit;
  font-size: 13px;
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
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line-inset);
  color: var(--lh-muted);
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary:focus-visible,
.btn-ghost:focus-visible,
.btn-text:focus-visible,
.chip:focus-visible,
.template:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 1px var(--lh-accent);
}

.templates {
  padding-top: 16px;
  border-top: 1px solid var(--lh-line);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.template {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 11px 13px;
  border: 0;
  border-radius: var(--lh-radius-item);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--lh-line);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: box-shadow var(--lh-ease);
}

.template:hover {
  box-shadow: inset 0 0 0 1px var(--lh-accent-edge);
}

.template-name {
  font-size: 12.5px;
  font-weight: 700;
}

.template-hint {
  font-size: 11px;
  color: var(--lh-dim);
}

/* Side */

.side {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sched {
  padding: 12px 0;
  border-bottom: 1px solid var(--lh-line);
}

.sched:first-of-type {
  margin-top: 8px;
  border-top: 1px solid var(--lh-line);
}

.sched-subject {
  font-size: 13px;
  font-weight: 700;
}

.sched-when {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--lh-dim);
}

.sched-actions {
  display: flex;
  gap: 14px;
  margin-top: 7px;
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

.btn-text.danger {
  color: var(--lh-faint);
}

.btn-text.danger:hover {
  color: var(--lh-danger);
}

.sent {
  padding: 14px 0;
  border-bottom: 1px solid var(--lh-line);
}

.sent:first-of-type {
  margin-top: 8px;
  border-top: 1px solid var(--lh-line);
}

.sent-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.sent-subject {
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
}

.sent-when {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--lh-dim);
}

.sent-body {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lh-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sent-meta {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin-top: 7px;
  font-size: 11px;
  color: var(--lh-dim);
}

.read {
  margin-left: auto;
  color: var(--lh-accent);
  font-weight: 700;
}

.empty.small {
  margin-top: 10px;
  font-size: 12px;
  color: var(--lh-muted);
}

@media (max-width: 1100px) {
  .split {
    grid-template-columns: 1fr;
  }

  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
