import axios from 'axios'

// Prefer same-origin /api (Vite proxies to the Express server in dev).
// Override with VITE_API_BASE_URL when the API is on another host.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
