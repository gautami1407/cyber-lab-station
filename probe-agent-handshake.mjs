import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

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
const username = `probe_${Date.now()}`;
await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ username, email: `${username}@example.test`, password: 'UniversityLab!2026', confirmPassword: 'UniversityLab!2026' }),
});

const keys = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const publicKey = keys.publicKey.toString();
const dir = mkdtempSync(join(tmpdir(), 'probe-agent-'));
const statePath = join(dir, 'identity.json');
writeFileSync(statePath, JSON.stringify({ agentId: 'probe-agent', publicKey, privateKey: keys.privateKey.toString() }, null, 2));
const pair = await request('/api/pairing/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ deviceName: 'Probe Agent', publicKey }),
});
const pairJson = await pair.json();
console.log('PAIR_REQ', pair.status, pairJson);
const approved = await request(`/api/pairing/${pairJson.data.id}/approve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
});
const approvedJson = await approved.json();
console.log('PAIR_APPROVED', approved.status, approvedJson);
const pairedDeviceId = approvedJson.data.paired.id;
console.log('PAIRED', pairedDeviceId);

const agent = spawn('node', ['C:/Users/DELL/Downloads/CNCBP/cyber-lab-station/agent/dist/index.js'], {
  env: {
    ...process.env,
    NETLINK_SERVER_URL: 'ws://127.0.0.1:4000',
    NETLINK_PAIRED_DEVICE_ID: pairedDeviceId,
    NETLINK_AGENT_STATE: statePath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
agent.stdout.on('data', (d) => console.log('[agent stdout]', d.toString().trim()));
agent.stderr.on('data', (d) => console.log('[agent stderr]', d.toString().trim()));
agent.on('exit', (code) => console.log('AGENT_EXIT', code));

setTimeout(() => {
  console.log('ENDING TEST');
  agent.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}, 15000);
