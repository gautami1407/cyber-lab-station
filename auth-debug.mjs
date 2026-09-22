import { generateKeyPairSync, sign } from 'node:crypto';

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
const username = `authdbg_${Date.now()}`;
await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ username, email: `${username}@example.test`, password: 'UniversityLab!2026', confirmPassword: 'UniversityLab!2026' }),
});
const keys = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const publicKey = keys.publicKey.toString();
const pair = await request('/api/pairing/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ deviceName: 'Auth Debug', publicKey }),
});
const pairJson = await pair.json();
console.log('PAIR_JSON', pairJson);
const approve = await request(`/api/pairing/${pairJson.data.id}/approve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
});
const approveJson = await approve.json();
console.log('APPROVE_JSON', approveJson);
const pairedId = approveJson.data.paired.id;
console.log('PAIRED_ID', pairedId);

const { WebSocket } = await import('ws');
const ws = new WebSocket(`ws://localhost:4000/api/agent-ws?pairedDeviceId=${pairedId}`);
ws.on('open', () => console.log('WS_OPEN'));
ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw));
  console.log('WS_MESSAGE', msg);
  if (msg.type === 'AGENT_CHALLENGE') {
    const signature = sign(null, Buffer.from(msg.nonce), keys.privateKey).toString('base64');
    ws.send(JSON.stringify({ type: 'AGENT_AUTH', agentId: 'auth-debug-agent', publicKey, signature }));
  }
  if (msg.type === 'AGENT_AUTHENTICATED') {
    console.log('AUTH_SUCCESS');
    setTimeout(() => ws.close(), 1000);
  }
});
ws.on('close', (code, reason) => console.log('WS_CLOSE', code, String(reason)));
ws.on('error', (error) => console.log('WS_ERROR', error.message));
setTimeout(() => {
  console.log('TIMEOUT_EXIT');
  ws.close();
}, 10000);
