import { createServer } from 'node:http';
import request from 'supertest';
import { createApp } from './server/src/app.ts';
import { attachRealtime } from './server/src/realtime.ts';
import { prisma } from './server/src/prisma.ts';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const server = createServer(createApp());
attachRealtime(server);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
console.log('SERVER_PORT', port);

const base = request.agent(server);
const csrf = (await base.get('/api/csrf')).body.data.csrfToken;
const username = `diag${Date.now()}`;
const email = `${username}@example.test`;
const reg = await base.post('/api/auth/register').set('X-CSRF-Token', csrf).send({ username, email, password: 'UniversityLab!2026', confirmPassword: 'UniversityLab!2026' });
console.log('REG', reg.status, reg.body?.data?.userId ?? reg.body);

const keys = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const pair = await base.post('/api/pairing/request').set('X-CSRF-Token', csrf).send({ deviceName: 'Diag Agent', publicKey: keys.publicKey });
console.log('PAIR', pair.status, pair.body);
const approved = await base.post(`/api/pairing/${pair.body.data.id}/approve`).set('X-CSRF-Token', csrf).send();
console.log('APPROVED', approved.status, approved.body);
const pairedDeviceId = approved.body.data.paired.id;
const dir = mkdtempSync(join(tmpdir(), 'netlink-debug-'));
const statePath = join(dir, 'identity.json');
const agentId = createHash('sha256').update(Buffer.from(keys.publicKey, 'utf8')).digest('hex').slice(0, 24);
writeFileSync(statePath, JSON.stringify({ agentId, publicKey: keys.publicKey, privateKey: keys.privateKey }, null, 2));
console.log('AGENT_STATE', statePath);

const child = spawn(process.execPath, ['C:/Users/DELL/Downloads/CNCBP/cyber-lab-station/agent/dist/index.js'], {
  env: { ...process.env, NETLINK_SERVER_URL: `ws://127.0.0.1:${port}`, NETLINK_PAIRED_DEVICE_ID: pairedDeviceId, NETLINK_AGENT_STATE: statePath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => console.log('[agent-out]', String(d)));
child.stderr.on('data', (d) => console.log('[agent-err]', String(d)));
child.on('exit', (code) => console.log('AGENT_EXIT', code));

for (let i = 0; i < 30; i += 1) {
  const db = await prisma.pairedDevice.findUnique({ where: { id: pairedDeviceId } });
  console.log('DB_CHECK', i, db?.connectionStatus, !!db?.publicKey);
  if (db?.connectionStatus === 'CONNECTED') break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const session = await base.post('/api/remote/session').set('X-CSRF-Token', csrf).send({ pairedDeviceId });
console.log('SESSION', session.status, session.body);
const op = await base.post('/api/remote/operation').set('X-CSRF-Token', csrf).send({ pairedDeviceId, sessionId: session.body.data.id, operation: 'SCREEN_CAPTURE' });
console.log('OPERATION', op.status, op.body);

setTimeout(() => {
  child.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
  server.close();
  process.exit(0);
}, 3000);
