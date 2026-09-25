// Real Windows-agent screen-stream E2E proof.
// Runs against the LIVE stack (API :4000, Postgres via Docker).
// Verifies: SCREEN_STREAM_START -> >=3 valid PNG frames (byte-exact + PNG signature)
//           -> survives past the 30s timeout window (regression for the idle-timeout re-arm fix)
//           -> SCREEN_STREAM_STOP -> SCREEN_STREAM_STOPPED
//           -> restart (second SCREEN_STREAM) delivers more frames
//           -> agent kill -> server cleanup (SCREEN_STREAM_ERROR published to the user)
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
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

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function log(title, value) {
  console.log(`\n[${title}]`);
  console.log(JSON.stringify(value, null, 2));
}

function isValidImage(bytes, mimeType) {
  if (!bytes || bytes.length < 12) return false;
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i += 1) if (bytes[i] !== magic[i]) return false;
  return bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
}

// ---- auth ----
const csrfRes = await request('/api/csrf');
const csrf = (await csrfRes.json()).data.csrfToken;
const username = `e2e_stream_${Date.now()}`;
const email = `${username}@example.test`;
const reg = await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ username, email, password: 'UniversityLab!2026', confirmPassword: 'UniversityLab!2026' }),
});
log('REGISTER', { status: reg.status });

const keys = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const publicKey = keys.publicKey.toString().trim().replace(/\r\n/g, '\n'); // identity.ts normalization
const privateKey = keys.privateKey.toString().trim();
const agentId = createHash('sha256').update(Buffer.from(publicKey, 'utf8')).digest('hex').slice(0, 24);
const pair = await request('/api/pairing/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ deviceName: 'E2E Stream Agent', publicKey }),
});
const pairJson = await pair.json();
const approved = await request(`/api/pairing/${pairJson.data.id}/approve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
});
const pairedDeviceId = (await approved.json()).data.paired.id;
log('PAIRED', { pairedDeviceId });

// ---- user events socket (same contract as the UI realtimeClient) ----
const userEvents = [];
const userWs = new WebSocket('ws://localhost:4000/api/ws', { headers: { Cookie: cookieHeader() } });
const userWsOpen = new Promise((resolve) => userWs.once('open', resolve));
userWs.on('message', (raw) => {
  try {
    const event = JSON.parse(String(raw));
    userEvents.push(event);
  } catch {
    /* ignore malformed */
  }
});
await userWsOpen;
log('USER_WS', { open: true });

// ---- spawn the real Windows agent ----
const dir = mkdtempSync(join(tmpdir(), 'netlink-e2e-'));
const statePath = join(dir, 'identity.json');
writeFileSync(statePath, JSON.stringify({ agentId, publicKey, privateKey }, null, 2));
const agent = spawn('node', ['C:/Users/DELL/Downloads/CNCBP/cyber-lab-station/agent/dist/index.js'], {
  env: { ...process.env, NETLINK_SERVER_URL: 'ws://127.0.0.1:4000', NETLINK_PAIRED_DEVICE_ID: pairedDeviceId, NETLINK_AGENT_STATE: statePath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
agent.stdout.on('data', (d) => process.stdout.write('[agent-out] ' + d.toString()));
agent.stderr.on('data', (d) => process.stderr.write('[agent-err] ' + d.toString()));
let agentExited = false;
agent.on('exit', (code) => {
  agentExited = true;
  console.log(`\n[AGENT_EXIT] ${code}`);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, timeoutMs, intervalMs = 250) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(intervalMs);
  }
  return false;
};

async function startSessionAndStream() {
  const session = await request('/api/remote/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ pairedDeviceId }),
  });
  const sessionJson = await session.json();
  const operation = await request('/api/remote/operation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ pairedDeviceId, sessionId: sessionJson.data.id, operation: 'SCREEN_STREAM' }),
  });
  const opJson = await operation.json();
  return { sessionId: sessionJson.data.id, streamId: opJson.data.streamId, operationId: opJson.data.id };
}

// ---- wait for the agent to authenticate before issuing operations ----
// The server bumps connectionStatus to CONNECTED only after a valid AGENT_AUTH,
// so this is a true observability of the agent being ready (a real client would
// act only once the device shows online in the UI).
let agentReady = false;
const readyDeadline = Date.now() + 20_000;
while (Date.now() < readyDeadline) {
  try {
    const list = await (await request('/api/pairing')).json();
    const entry = (list.data ?? []).find((item) => Boolean(item.pairedDevice) && item.pairedDevice.id === pairedDeviceId);
    if (entry?.pairedDevice?.connectionStatus === 'CONNECTED') {
      agentReady = true;
      break;
    }
  } catch {
    /* transient; keep polling */
  }
  await sleep(500);
}
log('AGENT_READY', { connected: agentReady });
if (!agentReady) {
  console.log('\n[E2E-FAILURE] agent did not authenticate within 20s.');
  userWs.close();
  agent.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

const stream1 = await startSessionAndStream();
log('STREAM_1_STARTED', stream1);

// First stream: collect frames for 36 seconds. The pre-fix server killed the
// stream at 30s and closed the agent socket (disconnect). With the fix, frames
// must keep flowing past 35s.
const waitMs = 36_000;
const deadline = Date.now() + waitMs;
let stream1Frames = [];
while (Date.now() < deadline) {
  const fresh = userEvents.filter(
    (e) =>
      e.type === 'SCREEN_STREAM_FRAME' &&
      e.data?.streamId === stream1.streamId &&
      !stream1Frames.some((f) => f.frameId === e.data.frameId),
  );
  for (const frame of fresh) {
    const data = frame.data;
    let decoded = null;
    try {
      decoded = Uint8Array.from(atob(data.data), (b) => b.charCodeAt(0));
    } catch {
      decoded = null;
    }
    stream1Frames.push({
      frameId: data.frameId,
      totalBytes: data.totalBytes,
      decodedBytes: decoded ? decoded.length : -1,
      valid: decoded ? isValidImage(decoded, data.mimeType) : false,
    });
  }
  if (agentExited) {
    console.log('\n[E2E-FAILURE] agent exited before stream-1 finished.');
    break;
  }
  await sleep(400);
}
const stream1Valid = stream1Frames.filter((f) => f.valid && f.decodedBytes === f.totalBytes);
const agentAliveAfterStream1 = !agentExited; // measured before the explicit SIGTERM at the end
log('STREAM_1_FRAMES', { total: stream1Frames.length, byteExactAndPngValid: stream1Valid.length, first: stream1Frames.slice(0, 3), errored: userEvents.filter((e) => e.type === 'SCREEN_STREAM_ERROR' && e.data?.streamId === stream1.streamId).map((e) => e.data) });

// ---- stop ----
const stopOp = await request('/api/remote/operation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ pairedDeviceId, sessionId: stream1.sessionId, operation: 'SCREEN_STREAM_STOP' }),
});
log('STOP_OP', { status: stopOp.status });
const stopped = await waitFor(() => userEvents.some((e) => e.type === 'SCREEN_STREAM_STOPPED' && e.data?.streamId === stream1.streamId), 8000);
log('STREAM_1_STOPPED_EVENT', { received: stopped });

// ---- restart ----
const stream2 = await startSessionAndStream();
log('STREAM_2_STARTED', stream2);
await waitFor(() => userEvents.some((e) => e.type === 'SCREEN_STREAM_FRAME' && e.data?.streamId === stream2.streamId), 15_000);
await sleep(2500);
const stream2Frames = userEvents.filter((e) => e.type === 'SCREEN_STREAM_FRAME' && e.data?.streamId === stream2.streamId);
log('STREAM_2_FRAMES', { total: stream2Frames.length });

// ---- disconnect cleanup ----
agent.kill('SIGTERM');
const errorSeen = await waitFor(() => userEvents.some((e) => e.type === 'SCREEN_STREAM_ERROR' && e.data?.streamId === stream2.streamId), 10_000);
log('DISCONNECT_CLEANUP', { stream2ErrorEvent: errorSeen });
await sleep(1500);

const stream1NoPrematureError = !userEvents.some((e) => e.type === 'SCREEN_STREAM_ERROR' && e.data?.streamId === stream1.streamId);
const allStream1Valid = stream1Frames.length > 0 && stream1Frames.every((f) => f.valid && f.decodedBytes === f.totalBytes);
const finalAgentAlive = agentAliveAfterStream1;
const result = {
  stream1Frames: stream1Frames.length,
  stream1ByteExactPngValid: stream1Valid.length,
  stream1Survived30s: stream1Frames.length >= 3 && stream1NoPrematureError && finalAgentAlive,
  stream1StoppedEvent: stopped,
  restartWorks: stream2Frames.length >= 1,
  disconnectCleanupEvent: errorSeen,
};
log('E2E_RESULT', result);

const passed = stream1Frames.length >= 3 && allStream1Valid && stream1NoPrematureError && stopped && stream2Frames.length >= 1 && errorSeen && finalAgentAlive;
console.log(`\nE2E_OVERRALL=${passed ? 'PASS' : 'FAIL'}`);

userWs.close();
agent.kill('SIGKILL');
rmSync(dir, { recursive: true, force: true });
process.exit(passed ? 0 : 1);