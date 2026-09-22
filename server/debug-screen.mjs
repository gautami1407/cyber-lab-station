import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import request from 'supertest';
import { createApp } from './src/app.js';
import { attachRealtime, closeRealtime } from './src/realtime.js';
import { prisma } from './src/prisma.js';

console.log('boot');
const server = createServer(createApp());
attachRealtime(server);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const app = request.agent(server);
const csrf = (await app.get('/api/csrf')).body.data.csrfToken;
console.log('csrf ok');
const suffix = Date.now();
const registered = await app.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
  username: `dbg${suffix}`,
  email: `dbg${suffix}@example.test`,
  password: 'UniversityLab!2026',
  confirmPassword: 'UniversityLab!2026',
});
const userId = registered.body.data.userId;
console.log('user', userId);
const keys = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const tmpDir = mkdtempSync(join(tmpdir(), 'netlinkdbg-'));
const statePath = join(tmpDir, 'state.json');
writeFileSync(statePath, JSON.stringify({ agentId: 'dbg-agent', publicKey: keys.publicKey, privateKey: keys.privateKey }));
const pairing = await app.post('/api/pairing/request').set('X-CSRF-Token', csrf).send({ deviceName: 'DBG', publicKey: keys.publicKey });
const approved = await app.post(`/api/pairing/${pairing.body.data.id}/approve`).set('X-CSRF-Token', csrf).send();
const pairedDeviceId = approved.body.data.paired.id;
console.log('paired', pairedDeviceId);
const session = await app.post('/api/remote/session').set('X-CSRF-Token', csrf).send({ pairedDeviceId });
const child = spawn(process.execPath, [resolve(process.cwd(), '..', 'agent', 'dist', 'index.js')], {
  env: { ...process.env, NETLINK_SERVER_URL: `ws://127.0.0.1:${address.port}`, NETLINK_PAIRED_DEVICE_ID: pairedDeviceId, NETLINK_AGENT_STATE: statePath },
  stdio: 'inherit',
});
console.log('spawned child');
for (let i = 0; i < 80; i++) {
  const pd = await prisma.pairedDevice.findUnique({ where: { id: pairedDeviceId } });
  if (pd && pd.connectionStatus === 'CONNECTED') {
    console.log('connected');
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}
const opReq = await app.post('/api/remote/operation').set('X-CSRF-Token', csrf).send({ pairedDeviceId, sessionId: session.body.data.id, operation: 'SCREEN_CAPTURE' });
console.log('req', opReq.status, JSON.stringify(opReq.body, null, 2));
const opId = opReq.body.data.id;
for (let i = 0; i < 80; i++) {
  const current = await prisma.remoteOperation.findUnique({ where: { id: opId } });
  console.log('poll', i, JSON.stringify(current && { status: current.status, reason: current.reason, resultJson: current.resultJson }, null, 2));
  if (current && current.status !== 'QUEUED') break;
  await new Promise((r) => setTimeout(r, 250));
}
const final = await prisma.remoteOperation.findUnique({ where: { id: opId } });
console.log('final', JSON.stringify(final && { status: final.status, reason: final.reason, resultJson: final.resultJson, pairedDeviceId: final.pairedDeviceId, sessionId: final.sessionId, userId: final.userId }, null, 2));
child.kill();
await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
closeRealtime();
server.closeAllConnections();
await new Promise((resolve) => server.close(() => resolve()));
rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);
