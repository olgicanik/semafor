// web/src/api.js — same-origin: the Vite dev proxy routes /api and /ws to FastAPI
export async function fetchServerStatus() {
  const r = await fetch("/api/v1/servers/status");
  return r.json();
}
export async function fetchServerJobs(serverName) {
  // limit=1000 covers the full 1,000-job demo server (v9: was 500, which
  // silently truncated the failed-first drill-down to the top half).
  const r = await fetch(`/api/v1/servers/${encodeURIComponent(serverName)}/jobs?limit=1000`);
  return r.json();
}
export async function fetchJobDetails(jobId) {
  const r = await fetch(`/api/v1/jobs/${jobId}/details`);
  return r.json();
}
export function openStatusSocket(onSnapshot) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => { try { onSnapshot(JSON.parse(ev.data)); } catch {} };
  return ws;
}
