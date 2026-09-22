import { WebSocket } from 'ws';

const base = 'http://localhost:4000';
const jar = new Map();
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (jar.size) headers.set('Cookie', [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
  const res = await fetch(base + path, { ...options, headers, credentials: 'include' });
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const entry of raw) {
    const [cookie] = entry.split(';');
    const idx = cookie.indexOf('=');
    if (idx > 0) jar.set(cookie.slice(0, idx), cookie.slice(idx + 1));
  }
  return res;
}

const csrfRes = await request('/api/csrf');
const csrf = (await csrfRes.json()).data.csrfToken;
const username = `wscheck_${Date.now()}`;
await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ username, email: `${username}@example.test`, password: 'UniversityLab!2026', confirmPassword: 'UniversityLab!2026' }),
});
const pair = await request('/api/pairing/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ deviceName: 'WS Check', publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu5E0b0noF4ig6m8Pd0O9Z7pvDWWGx4UzO1l3v7KQf04M=\n-----END PUBLIC KEY-----\n' }),
});
const pairJson = await pair.json();
const approved = await request(`/api/pairing/${pairJson.data.id}/approve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
});
const approvedJson = await approved.json();
const pairedId = approvedJson.data.paired.id;
console.log('PAIRED_ID', pairedId);
const socket = new WebSocket(`ws://localhost:4000/api/agent-ws?pairedDeviceId=${pairedId}`);
socket.on('open', () => console.log('WS_OPEN'));
socket.on('message', (raw) => console.log('WS_MSG', String(raw)));
socket.on('close', (code, reason) => console.log('WS_CLOSE', code, String(reason)));
socket.on('error', (err) => console.log('WS_ERR', err.message));
setTimeout(() => socket.close(), 8000);
