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
  classId: number
  conversationId: number | null
  title: string
  classDate: string
  timeLabel: string
  status: string
  peer: ChatPeer | null
  unreadCount: number
  lastMessage: ChatMessage | null
}

interface ChatThreadResponse {
  threads: ChatThread[]
  unreadTotal: number
}

interface ChatMessagesResponse {
  conversationId: number
  classId: number
  title: string
  classDate: string
  timeLabel: string
  peer: ChatPeer | null
  messages: ChatMessage[]
}

interface ChatState {
  threads: ChatThread[]
  unreadTotal: number
  activeClassId: number | null
  activeTitle: string
  activePeer: ChatPeer | null
  messages: ChatMessage[]
  loadingThreads: boolean
  loadingMessages: boolean
  sending: boolean
  error: string | null
}

export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    threads: [],
    unreadTotal: 0,
    activeClassId: null,
    activeTitle: '',
    activePeer: null,
    messages: [],
    loadingThreads: false,
    loadingMessages: false,
    sending: false,
    error: null,
  }),

  actions: {
    async fetchThreads() {
      this.loadingThreads = true
      this.error = null
      try {
        const res = await api.get<ChatThreadResponse>('/chat/threads')
        this.threads = res.data.threads || []
        this.unreadTotal = res.data.unreadTotal || 0
      } catch (err) {
        this.error = 'Could not load class chats'
        throw err
      } finally {
        this.loadingThreads = false
      }
    },

    async openThread(classId: number) {
      this.loadingMessages = true
      this.error = null
      this.activeClassId = classId
      try {
        const res = await api.get<ChatMessagesResponse>(`/chat/classes/${classId}/messages`)
        this.messages = res.data.messages || []
        this.activeTitle = res.data.title || 'Class chat'
        this.activePeer = res.data.peer
        this.threads = this.threads.map((thread) =>
          thread.classId === classId ? { ...thread, unreadCount: 0 } : thread,
        )
        this.unreadTotal = this.threads.reduce((sum, thread) => sum + thread.unreadCount, 0)
      } catch (err) {
        this.error = 'Could not open this class chat'
        throw err
      } finally {
        this.loadingMessages = false
      }
    },

    async refreshActiveThread() {
      if (!this.activeClassId) return
      const res = await api.get<ChatMessagesResponse>(
        `/chat/classes/${this.activeClassId}/messages`,
      )
      this.messages = res.data.messages || []
      this.activeTitle = res.data.title || this.activeTitle
      this.activePeer = res.data.peer
    },

    async sendMessage(body: string) {
      if (!this.activeClassId) return
      const text = body.trim()
      if (!text) return

      this.sending = true
      this.error = null
      try {
        const res = await api.post<{ item: ChatMessage }>(
          `/chat/classes/${this.activeClassId}/messages`,
          { body: text },
        )
        this.messages = [...this.messages, res.data.item]
        await this.fetchThreads()
        return res.data.item
      } catch (err) {
        this.error = 'Could not send message'
        throw err
      } finally {
        this.sending = false
      }
    },

    clearActiveThread() {
      this.activeClassId = null
      this.activeTitle = ''
      this.activePeer = null
      this.messages = []
    },
  },
})
