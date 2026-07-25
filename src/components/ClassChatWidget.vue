<template>
  <div class="chat-widget">
    <transition name="panel">
      <section v-if="open" class="chat-panel" aria-label="Class chat">
        <header class="panel-head">
          <div>
            <p class="kicker">Class chat</p>
            <h2>{{ panelTitle }}</h2>
            <p class="copy">{{ panelCopy }}</p>
          </div>
          <div class="head-actions">
            <button
              v-if="activeClassId"
              type="button"
              class="text-btn"
              @click="backToThreads"
            >
              All classes
            </button>
            <button type="button" class="icon-btn" aria-label="Close chat" @click="closePanel">
              ×
            </button>
          </div>
        </header>

        <div v-if="!activeClassId" class="thread-pane">
          <p v-if="loadingThreads" class="hint">Loading booked class chats…</p>
          <p v-else-if="!threads.length" class="hint">
            No booked classes yet. Chat opens after a class is confirmed with a teacher.
          </p>
          <ul v-else class="thread-list">
            <li v-for="thread in threads" :key="thread.classId">
              <button type="button" class="thread-btn" @click="openThread(thread.classId)">
                <div class="thread-top">
                  <strong>{{ thread.peer?.fullName || 'Class partner' }}</strong>
                  <span v-if="thread.unreadCount" class="badge">{{ thread.unreadCount }}</span>
                </div>
                <p class="meta">
                  {{ formatDate(thread.classDate) }}
                  <span v-if="thread.timeLabel"> · {{ thread.timeLabel }}</span>
                </p>
                <p class="preview">
                  {{ thread.lastMessage?.body || thread.title || 'Start the conversation' }}
                </p>
              </button>
            </li>
          </ul>
        </div>

        <div v-else class="message-pane">
          <p v-if="loadingMessages" class="hint">Loading messages…</p>
          <div v-else ref="messageListEl" class="message-list">
            <p v-if="!messages.length" class="hint">
              No messages yet. Say hello about this booked class.
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
              placeholder="Message about this class…"
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
      :aria-expanded="open"
      aria-label="Open class chat"
      @click="togglePanel"
    >
      <img :src="chatLogo" alt="" width="56" height="56" />
      <span v-if="!open && unreadTotal" class="launcher-badge">{{ unreadTotal }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '../stores/chat'
import chatLogo from '../assets/chat-logo.svg'

const chatStore = useChatStore()
const {
  threads,
  unreadTotal,
  activeClassId,
  activeTitle,
  activePeer,
  messages,
  loadingThreads,
  loadingMessages,
  sending,
  error,
} = storeToRefs(chatStore)

const open = ref(false)
const draft = ref('')
const messageListEl = ref<HTMLElement | null>(null)
let pollTimer: number | null = null

const panelTitle = computed(() => {
  if (!activeClassId.value) return 'Booked classes'
  return activePeer.value?.fullName || activeTitle.value || 'Class chat'
})

const panelCopy = computed(() => {
  if (!activeClassId.value) {
    return 'Message your teacher or student for a booked class only.'
  }
  return activeTitle.value || 'Class conversation'
})

async function togglePanel() {
  open.value = !open.value
  if (open.value) {
    await chatStore.fetchThreads()
    startPolling()
  } else {
    stopPolling()
    chatStore.clearActiveThread()
  }
}

function closePanel() {
  open.value = false
  stopPolling()
  chatStore.clearActiveThread()
}

function backToThreads() {
  chatStore.clearActiveThread()
  void chatStore.fetchThreads()
}

async function openThread(classId: number) {
  draft.value = ''
  await chatStore.openThread(classId)
  await scrollToBottom()
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
    if (!open.value) return
    try {
      if (activeClassId.value) {
        await chatStore.refreshActiveThread()
        await scrollToBottom()
      } else {
        await chatStore.fetchThreads()
      }
    } catch {
      // ignore transient poll errors
    }
  }, 5000)
}

function stopPolling() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function formatDate(value: string) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
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
    if (open.value && activeClassId.value) await scrollToBottom()
  },
)

onMounted(async () => {
  try {
    await chatStore.fetchThreads()
  } catch {
    // store error
  }
})

onUnmounted(() => {
  stopPolling()
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
  gap: 0.75rem;
}

.launcher {
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.85rem;
  background: #0a0a0a;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  overflow: hidden;
}

.launcher img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.launcher-badge {
  position: absolute;
  top: -0.3rem;
  right: -0.3rem;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--lh-accent);
  color: #0d1512;
  font-family: 'Manrope', sans-serif;
  font-size: 0.68rem;
  font-weight: 800;
  display: inline-grid;
  place-items: center;
}

.chat-panel {
  width: min(22.5rem, calc(100vw - 1.5rem));
  height: min(32rem, calc(100vh - 6.5rem));
  display: grid;
  grid-template-rows: auto 1fr auto;
  border: 1px solid var(--lh-line);
  border-radius: 1.05rem;
  background:
    linear-gradient(165deg, rgba(36, 44, 54, 0.55), transparent 42%),
    var(--lh-panel);
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
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
.meta,
.preview,
.bubble-body,
time,
button,
textarea,
.error,
strong {
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
  padding: 0.65rem;
}

.thread-list {
  list-style: none;
  display: grid;
  gap: 0.45rem;
}

.thread-btn {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  padding: 0.7rem 0.75rem;
  background: rgba(16, 20, 26, 0.4);
  color: var(--lh-ink);
  cursor: pointer;
}

.thread-btn:hover {
  border-color: rgba(126, 184, 164, 0.3);
  background: var(--lh-accent-soft);
}

.thread-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.thread-top strong {
  font-size: 0.9rem;
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

.meta,
.preview,
.hint {
  margin-top: 0.25rem;
  color: var(--lh-muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.preview {
  color: var(--lh-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint {
  padding: 0.85rem 0.35rem;
  font-style: italic;
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
.panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@media (max-width: 600px) {
  .chat-widget {
    right: 0.85rem;
    bottom: 0.85rem;
  }

  .chat-panel {
    width: min(22.5rem, calc(100vw - 1.2rem));
  }
}
</style>
