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

function log(title, value) {
  console.log(`\n[${title}]`);
  console.log(JSON.stringify(value, null, 2));
}

const csrfRes = await request('/api/csrf');
const csrf = (await csrfRes.json()).data.csrfToken;
const username = `livestream_${Date.now()}`;
const email = `${username}@example.test`;
await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ username, email, password: 'UniversityLab!2026', confirmPassword: 'UniversityLab!2026' }),
});

const keys = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const publicKey = keys.publicKey.toString();
const pair = await request('/api/pairing/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ deviceName: 'Live Stream Agent', publicKey }),
});
const pairJson = await pair.json();
log('PAIR_REQUEST', pairJson);
const approved = await request(`/api/pairing/${pairJson.data.id}/approve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
});
const approvedJson = await approved.json();
const pairedDeviceId = approvedJson.data.paired.id;
log('PAIRED_DEVICE', { pairedDeviceId });

const dir = mkdtempSync(join(tmpdir(), 'netlink-live-'));
const statePath = join(dir, 'identity.json');
writeFileSync(statePath, JSON.stringify({ agentId: 'live-stream-agent', publicKey, privateKey: keys.privateKey.toString() }, null, 2));

const agent = spawn('node', ['C:/Users/DELL/Downloads/CNCBP/cyber-lab-station/agent/dist/index.js'], {
  env: { ...process.env, NETLINK_SERVER_URL: 'ws://127.0.0.1:4000', NETLINK_PAIRED_DEVICE_ID: pairedDeviceId, NETLINK_AGENT_STATE: statePath },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
});
agent.stdout.on('data', (d) => process.stdout.write('[agent-out] ' + d.toString()));
agent.stderr.on('data', (d) => process.stderr.write('[agent-err] ' + d.toString()));
agent.on('exit', (code) => console.log(`\n[AGENT_EXIT] ${code}`));

const waitForAgent = async (predicate) => {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const started = await waitForAgent(() => (process.env.RUNNING ?? '') !== '');
void started;
await new Promise((resolve) => setTimeout(resolve, 3000));

const session = await request('/api/remote/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ pairedDeviceId: pairedDeviceId }),
});
const sessionJson = await session.json();
log('SESSION', sessionJson);
const operation = await request('/api/remote/operation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ pairedDeviceId, sessionId: sessionJson.data.id, operation: 'SCREEN_STREAM' }),
});
const opJson = await operation.json();
log('OPERATION', opJson);

await new Promise((resolve) => setTimeout(resolve, 20000));

agent.kill('SIGTERM');
rmSync(dir, { recursive: true, force: true });
process.exit(0);
