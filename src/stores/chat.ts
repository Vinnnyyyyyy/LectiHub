import { defineStore } from 'pinia'
import api from '../api/axios'

export interface ChatPeer {
  id: number
  username: string
  fullName: string
  email: string
}

export interface ChatMessage {
  id: number
  conversationId: number
  senderId: number
  body: string
  isRead: boolean
  createdAt: string
  mine: boolean
  sender: ChatPeer | null
}

export interface ChatThread {
  peerId: number
  conversationId: number | null
  peer: ChatPeer | null
  unreadCount: number
  lastMessage: ChatMessage | null
}

export interface ChatPopupNotice {
  id: string
  peerId: number
  peerName: string
  body: string
}

interface ChatThreadResponse {
  threads: ChatThread[]
  unreadTotal: number
}

interface ChatMessagesResponse {
  conversationId: number
  peerId: number
  peer: ChatPeer | null
  messages: ChatMessage[]
}

interface ChatState {
  threads: ChatThread[]
  unreadTotal: number
  activePeerId: number | null
  activePeer: ChatPeer | null
  messages: ChatMessage[]
  loadingThreads: boolean
  loadingMessages: boolean
  sending: boolean
  error: string | null
  notices: ChatPopupNotice[]
  seenMessageIds: number[]
}

export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    threads: [],
    unreadTotal: 0,
    activePeerId: null,
    activePeer: null,
    messages: [],
    loadingThreads: false,
    loadingMessages: false,
    sending: false,
    error: null,
    notices: [],
    seenMessageIds: [],
  }),

  actions: {
    async fetchThreads(options: { announce?: boolean } = {}) {
      const announce = options.announce !== false
      this.loadingThreads = true
      this.error = null
      try {
        const res = await api.get<ChatThreadResponse>('/chat/threads')
        const nextThreads = res.data.threads || []

        if (announce) {
          for (const thread of nextThreads) {
            const last = thread.lastMessage
            if (!last || last.mine || !last.id) continue
            if (this.seenMessageIds.includes(last.id)) continue
            if (this.activePeerId === thread.peerId) continue

            this.notices = [
              {
                id: `${last.id}-${Date.now()}`,
                peerId: thread.peerId,
                peerName: thread.peer?.fullName || 'New message',
                body: last.body,
              },
              ...this.notices,
            ].slice(0, 3)

            this.seenMessageIds = [...this.seenMessageIds, last.id].slice(-200)
          }
        } else {
          // Seed seen ids on first load so old messages don't toast.
          const seedIds = nextThreads
            .map((thread) => thread.lastMessage?.id)
            .filter((id): id is number => typeof id === 'number')
          this.seenMessageIds = [...new Set([...this.seenMessageIds, ...seedIds])].slice(-200)
        }

        this.threads = nextThreads
        this.unreadTotal = res.data.unreadTotal || 0
      } catch (err) {
        this.error = 'Could not load contacts'
        throw err
      } finally {
        this.loadingThreads = false
      }
    },

    dismissNotice(id: string) {
      this.notices = this.notices.filter((item) => item.id !== id)
    },

    clearNotices() {
      this.notices = []
    },

    async openThread(peerId: number) {
      this.loadingMessages = true
      this.error = null
      this.activePeerId = peerId
      this.notices = this.notices.filter((item) => item.peerId !== peerId)
      try {
        const res = await api.get<ChatMessagesResponse>(`/chat/peers/${peerId}/messages`)
        this.messages = res.data.messages || []
        this.activePeer = res.data.peer
        this.threads = this.threads.map((thread) =>
          thread.peerId === peerId ? { ...thread, unreadCount: 0 } : thread,
        )
        this.unreadTotal = this.threads.reduce((sum, thread) => sum + thread.unreadCount, 0)

        const ids = this.messages.map((item) => item.id)
        this.seenMessageIds = [...new Set([...this.seenMessageIds, ...ids])].slice(-200)
      } catch (err) {
        this.error = 'Could not open this chat'
        throw err
      } finally {
        this.loadingMessages = false
      }
    },

    async refreshActiveThread() {
      if (!this.activePeerId) return
      const previousIds = new Set(this.messages.map((item) => item.id))
      const res = await api.get<ChatMessagesResponse>(`/chat/peers/${this.activePeerId}/messages`)
      this.messages = res.data.messages || []
      this.activePeer = res.data.peer

      for (const item of this.messages) {
        if (!previousIds.has(item.id) && !item.mine) {
          // Keep active conversation quiet; badge updates via fetchThreads.
          this.seenMessageIds = [...this.seenMessageIds, item.id].slice(-200)
        }
      }
    },

    async sendMessage(body: string) {
      if (!this.activePeerId) return
      const text = body.trim()
      if (!text) return

      this.sending = true
      this.error = null
      try {
        const res = await api.post<{ item: ChatMessage }>(
          `/chat/peers/${this.activePeerId}/messages`,
          { body: text },
        )
        this.messages = [...this.messages, res.data.item]
        this.seenMessageIds = [...this.seenMessageIds, res.data.item.id].slice(-200)
        await this.fetchThreads({ announce: false })
        return res.data.item
      } catch (err) {
        this.error = 'Could not send message'
        throw err
      } finally {
        this.sending = false
      }
    },

    clearActiveThread() {
      this.activePeerId = null
      this.activePeer = null
      this.messages = []
    },
  },
})
