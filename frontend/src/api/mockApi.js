import axios from 'axios'

/**
 * Mock API client. Every request is served by the FastAPI mock backend at
 * VITE_API_BASE_URL (default http://localhost:8000). To move to a real
 * backend later, only this module changes — components import from here.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 })

/** All servers with nested jobs (polled by the dashboard). */
export function fetchServers() {
  return api.get('/api/servers').then((res) => res.data)
}

/** Jobs for a single server (no server-side simulation on this endpoint). */
export function fetchServerJobs(serverId) {
  return api.get(`/api/servers/${serverId}/jobs`).then((res) => res.data)
}

/** Pin / unpin a server so it floats to the top of its section. */
export function pinServer(serverId) {
  return api.post(`/api/servers/${serverId}/pin`).then((res) => res.data)
}
export function unpinServer(serverId) {
  return api.post(`/api/servers/${serverId}/unpin`).then((res) => res.data)
}

/** Create a new server (Add-New-Server modal). */
export function createServer(payload) {
  return api.post('/api/servers', payload, { timeout: 10000 }).then((res) => res.data)
}

/** Mock analytics (uptime / failure rate / most-unstable server). */
export function fetchAnalytics() {
  return api.get('/api/analytics').then((res) => res.data)
}

export default api
