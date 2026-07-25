<template>
  <div class="chat-widget">
    <div class="notice-stack" aria-live="polite">
      <transition-group name="notice">
        <button
          v-for="notice in notices"
          :key="notice.id"
          type="button"
          class="chat-notice"
          @click="openFromNotice(notice)"
        >
          <span class="notice-kicker">New message</span>
          <strong>{{ notice.peerName }}</strong>
          <span class="notice-body">{{ notice.body }}</span>
        </button>
      </transition-group>
    </div>

    <transition name="panel">
      <section v-if="open" class="chat-panel" aria-label="Messenger">
        <header class="panel-head">
          <div>
            <p class="kicker">Messenger</p>
            <h2>{{ panelTitle }}</h2>
            <p class="copy">{{ panelCopy }}</p>
          </div>
          <div class="head-actions">
            <button
              v-if="activePeerId"
              type="button"
              class="text-btn"
              @click="backToContacts"
            >
              Contacts
            </button>
            <button type="button" class="icon-btn" aria-label="Close chat" @click="closePanel">
              ×
            </button>
          </div>
        </header>

        <div v-if="!activePeerId" class="thread-pane">
          <p v-if="loadingThreads" class="hint">Loading contacts…</p>
          <p v-else-if="!threads.length" class="hint">
            No assigned contacts yet. Chat unlocks after a class is booked with a teacher.
          </p>
          <ul v-else class="thread-list">
            <li v-for="thread in threads" :key="thread.peerId">
              <button type="button" class="thread-btn" @click="openThread(thread.peerId)">
                <span class="avatar" aria-hidden="true">
                  {{ initials(thread.peer?.fullName || thread.peer?.username || '?') }}
                </span>
                <span class="contact-name">{{ thread.peer?.fullName || 'Contact' }}</span>
                <span v-if="thread.unreadCount" class="badge">{{ thread.unreadCount }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div v-else class="message-pane">
          <p v-if="loadingMessages" class="hint">Loading messages…</p>
          <div v-else ref="messageListEl" class="message-list">
            <p v-if="!messages.length" class="hint">
              No messages yet. Say hello to start the conversation.
            </p>
            <div
              v-for="item in messages"
              :key="item.id"
              class="bubble"
              :class="{ mine: item.mine }"
            >
              <p class="bubble-body">{{ item.body }}</p>
              <time>{{ formatDateTime(item.createdAt) }}</time>
            </div>
          </div>

          <form class="composer" @submit.prevent="handleSend">
            <textarea
              v-model="draft"
              rows="2"
              maxlength="2000"
              placeholder="Write a message…"
              :disabled="sending"
              @keydown.enter.exact.prevent="handleSend"
            />
            <button type="submit" :disabled="sending || !draft.trim()">
              {{ sending ? 'Sending…' : 'Send' }}
            </button>
          </form>
        </div>

        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </section>
    </transition>

    <button
      type="button"
      class="launcher"
      :class="{ open, unread: !open && unreadTotal > 0 }"
      :aria-expanded="open"
      aria-label="Open messenger"
      @click="togglePanel"
    >
      <span class="launcher-glow" aria-hidden="true" />
      <svg class="launcher-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path
          class="bubble"
          d="M14 15.5c0-2.5 2-4.5 4.5-4.5h11c2.5 0 4.5 2 4.5 4.5v10c0 2.5-2 4.5-4.5 4.5H24l-5.5 4.5V30H18.5c-2.5 0-4.5-2-4.5-4.5v-10z"
        />
        <circle cx="21" cy="20.5" r="1.5" />
        <circle cx="24.5" cy="20.5" r="1.5" />
        <circle cx="28" cy="20.5" r="1.5" />
      </svg>
      <span v-if="!open && unreadTotal" class="launcher-badge">{{ unreadTotal }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore, type ChatPopupNotice } from '../stores/chat'

const chatStore = useChatStore()
const {
  threads,
  unreadTotal,
  activePeerId,
  activePeer,
  messages,
  loadingThreads,
  loadingMessages,
  sending,
  error,
  notices,
} = storeToRefs(chatStore)

const open = ref(false)
const draft = ref('')
const messageListEl = ref<HTMLElement | null>(null)
let pollTimer: number | null = null
let noticeTimers = new Map<string, number>()

const panelTitle = computed(() => {
  if (!activePeerId.value) return 'Contacts'
  return activePeer.value?.fullName || 'Chat'
})

const panelCopy = computed(() => {
  if (!activePeerId.value) {
    return 'Chat with your assigned teacher or student.'
  }
  return 'Direct messages for your booked classes.'
})

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

async function togglePanel() {
  open.value = !open.value
  if (open.value) {
    chatStore.clearNotices()
    await chatStore.fetchThreads({ announce: false })
  } else {
    chatStore.clearActiveThread()
  }
}

function closePanel() {
  open.value = false
  chatStore.clearActiveThread()
}

function backToContacts() {
  chatStore.clearActiveThread()
  void chatStore.fetchThreads({ announce: false })
}

async function openThread(peerId: number) {
  draft.value = ''
  open.value = true
  await chatStore.openThread(peerId)
  await scrollToBottom()
}

async function openFromNotice(notice: ChatPopupNotice) {
  chatStore.dismissNotice(notice.id)
  await openThread(notice.peerId)
}

async function handleSend() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  draft.value = ''
  await chatStore.sendMessage(text)
  await scrollToBottom()
}

async function scrollToBottom() {
  await nextTick()
  if (messageListEl.value) {
    messageListEl.value.scrollTop = messageListEl.value.scrollHeight
  }
}

function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(async () => {
    try {
      if (activePeerId.value) {
        await chatStore.refreshActiveThread()
        await chatStore.fetchThreads({ announce: false })
        await scrollToBottom()
      } else {
        await chatStore.fetchThreads({ announce: true })
      }
    } catch {
      // ignore transient poll errors
    }
  }, 4000)
}

function stopPolling() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function formatDateTime(value: string) {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

watch(
  () => messages.value.length,
  async () => {
    if (open.value && activePeerId.value) await scrollToBottom()
  },
)

watch(
  notices,
  (items) => {
    for (const notice of items) {
      if (noticeTimers.has(notice.id)) continue
      const timer = window.setTimeout(() => {
        chatStore.dismissNotice(notice.id)
        noticeTimers.delete(notice.id)
      }, 6000)
      noticeTimers.set(notice.id, timer)
    }
  },
  { deep: true },
)

onMounted(async () => {
  try {
    await chatStore.fetchThreads({ announce: false })
  } catch {
    // store error
  }
  startPolling()
})

onUnmounted(() => {
  stopPolling()
  for (const timer of noticeTimers.values()) window.clearTimeout(timer)
  noticeTimers.clear()
})
</script>

<style scoped>
.chat-widget {
  position: fixed;
  right: 1.15rem;
  bottom: 1.15rem;
  z-index: 40;
  display: grid;
  justify-items: end;
  gap: 0.7rem;
}

.notice-stack {
  display: grid;
  gap: 0.45rem;
  width: min(20rem, calc(100vw - 1.5rem));
}

.chat-notice {
  display: grid;
  gap: 0.15rem;
  text-align: left;
  border: 1px solid rgba(126, 184, 164, 0.35);
  border-radius: 0.85rem;
  padding: 0.7rem 0.8rem;
  background:
    linear-gradient(135deg, rgba(126, 184, 164, 0.16), transparent 55%),
    rgba(16, 20, 26, 0.92);
  color: var(--lh-ink);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
  cursor: pointer;
}

.notice-kicker {
  font-family: 'Manrope', sans-serif;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-accent);
}

.chat-notice strong {
  font-family: 'Manrope', sans-serif;
  font-size: 0.92rem;
  font-weight: 750;
}

.notice-body {
  font-family: 'Manrope', sans-serif;
  color: var(--lh-muted);
  font-size: 0.8rem;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.launcher {
  position: relative;
  width: 3.55rem;
  height: 3.55rem;
  padding: 0;
  border: 1px solid var(--lh-line-strong);
  border-radius: 1rem;
  background:
    linear-gradient(165deg, rgba(126, 184, 164, 0.12), transparent 42%),
    var(--lh-panel-solid);
  box-shadow: var(--lh-shadow);
  cursor: pointer;
  overflow: visible;
  display: grid;
  place-items: center;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.launcher-glow {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: radial-gradient(circle at 30% 20%, rgba(126, 184, 164, 0.22), transparent 58%);
  opacity: 0.75;
  pointer-events: none;
}

.launcher-icon {
  position: relative;
  z-index: 1;
  width: 1.7rem;
  height: 1.7rem;
}

.launcher-icon .bubble {
  fill: none;
  stroke: var(--lh-ink);
  stroke-width: 2.2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.launcher-icon circle {
  fill: var(--lh-accent);
}

.launcher:hover {
  border-color: rgba(126, 184, 164, 0.45);
  transform: translateY(-1px);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(126, 184, 164, 0.12);
}

.launcher:focus-visible {
  outline: 2px solid rgba(126, 184, 164, 0.55);
  outline-offset: 3px;
}

.launcher.open {
  border-color: rgba(126, 184, 164, 0.5);
  background:
    linear-gradient(165deg, rgba(126, 184, 164, 0.2), transparent 50%),
    var(--lh-panel-solid);
}

.launcher.unread {
  border-color: rgba(126, 184, 164, 0.4);
}

.launcher-badge {
  position: absolute;
  top: -0.35rem;
  right: -0.35rem;
  z-index: 2;
  min-width: 1.3rem;
  height: 1.3rem;
  padding: 0 0.32rem;
  border-radius: 999px;
  border: 2px solid var(--lh-bg);
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
  font-family: 'Manrope', sans-serif;
  font-size: 0.68rem;
  font-weight: 800;
  display: inline-grid;
  place-items: center;
  box-shadow: 0 4px 12px rgba(79, 143, 123, 0.35);
}

.chat-panel {
  width: min(22.5rem, calc(100vw - 1.5rem));
  height: min(32rem, calc(100vh - 6.5rem));
  display: grid;
  grid-template-rows: auto 1fr auto;
  border: 1px solid var(--lh-line);
  border-radius: 1.15rem;
  background:
    radial-gradient(ellipse 70% 45% at 0% 0%, rgba(126, 184, 164, 0.1), transparent 55%),
    linear-gradient(165deg, rgba(36, 44, 54, 0.55), transparent 42%),
    var(--lh-panel);
  backdrop-filter: blur(14px);
  box-shadow: var(--lh-shadow);
  overflow: hidden;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.95rem 1rem 0.85rem;
  border-bottom: 1px solid var(--lh-line);
}

.kicker,
.copy,
.hint,
.bubble-body,
time,
button,
textarea,
.error,
.contact-name,
.badge {
  font-family: 'Manrope', sans-serif;
}

.kicker {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lh-faint);
}

.panel-head h2 {
  margin: 0.15rem 0 0;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-ink);
}

.copy {
  margin: 0.25rem 0 0;
  color: var(--lh-muted);
  font-size: 0.8rem;
  line-height: 1.4;
}

.head-actions {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
}

.text-btn,
.icon-btn {
  border: 1px solid var(--lh-line);
  background: rgba(16, 20, 26, 0.55);
  color: var(--lh-ink);
  cursor: pointer;
}

.text-btn {
  border-radius: 0.55rem;
  padding: 0.35rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.icon-btn {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 0.55rem;
  font-size: 1.15rem;
  line-height: 1;
}

.thread-pane,
.message-pane {
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr auto;
}

.thread-pane {
  overflow: auto;
  padding: 0.55rem;
}

.thread-list {
  list-style: none;
  display: grid;
  gap: 0.3rem;
}

.thread-btn {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.7rem;
  text-align: left;
  border: 1px solid var(--lh-line);
  border-radius: 0.85rem;
  padding: 0.7rem 0.75rem;
  background: rgba(16, 20, 26, 0.42);
  color: var(--lh-ink);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.thread-btn:hover {
  border-color: rgba(126, 184, 164, 0.35);
  background: var(--lh-accent-soft);
}

.avatar {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgba(126, 184, 164, 0.22);
  background:
    linear-gradient(160deg, rgba(126, 184, 164, 0.2), transparent 70%),
    rgba(20, 25, 31, 0.8);
  color: var(--lh-accent);
  font-size: 0.72rem;
  font-weight: 800;
}

.contact-name {
  font-size: 0.95rem;
  font-weight: 750;
}

.badge {
  min-width: 1.2rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: var(--lh-accent);
  color: #0d1512;
  font-size: 0.68rem;
  font-weight: 800;
  text-align: center;
}

.hint {
  margin: 0;
  padding: 0.85rem 0.35rem;
  color: var(--lh-muted);
  font-size: 0.8rem;
  font-style: italic;
  line-height: 1.4;
}

.message-pane {
  min-height: 0;
}

.message-list {
  min-height: 0;
  overflow: auto;
  padding: 0.75rem;
  display: grid;
  gap: 0.55rem;
  align-content: start;
}

.bubble {
  max-width: 85%;
  justify-self: start;
  padding: 0.55rem 0.7rem;
  border-radius: 0.8rem 0.8rem 0.8rem 0.25rem;
  background: rgba(16, 20, 26, 0.65);
  border: 1px solid var(--lh-line);
}

.bubble.mine {
  justify-self: end;
  border-radius: 0.8rem 0.8rem 0.25rem 0.8rem;
  background: var(--lh-accent-soft);
  border-color: rgba(126, 184, 164, 0.3);
}

.bubble-body {
  margin: 0;
  color: var(--lh-ink);
  font-size: 0.88rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

time {
  display: block;
  margin-top: 0.3rem;
  color: var(--lh-faint);
  font-size: 0.68rem;
}

.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.45rem;
  padding: 0.7rem;
  border-top: 1px solid var(--lh-line);
  background: rgba(10, 14, 18, 0.45);
}

.composer textarea {
  resize: none;
  border-radius: 0.7rem;
  border: 1px solid var(--lh-line-strong);
  background: var(--lh-input);
  color: var(--lh-ink);
  padding: 0.55rem 0.65rem;
  font: inherit;
  font-size: 0.86rem;
  color-scheme: dark;
}

.composer button {
  border: 0;
  border-radius: 0.7rem;
  padding: 0.55rem 0.85rem;
  font-weight: 750;
  background: linear-gradient(135deg, var(--lh-accent) 0%, var(--lh-accent-deep) 100%);
  color: #0d1512;
  cursor: pointer;
  align-self: end;
}

.composer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin: 0;
  padding: 0.45rem 0.85rem 0.7rem;
  color: var(--lh-danger);
  font-size: 0.8rem;
}

.panel-enter-active,
.panel-leave-active,
.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.panel-enter-from,
.panel-leave-to,
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@media (max-width: 600px) {
  .chat-widget {
    right: 0.85rem;
    bottom: 0.85rem;
  }

  .chat-panel,
  .notice-stack {
    width: min(22.5rem, calc(100vw - 1.2rem));
  }
}
</style>
