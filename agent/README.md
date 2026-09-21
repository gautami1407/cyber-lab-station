# NetLink Agent

The agent is a separate, allowlisted remote-management client. It generates an Ed25519 key pair on first start and stores it in `NETLINK_AGENT_STATE` (default: `./netlink-agent-state.json`). The public key must be submitted through the authenticated pairing request flow and approved before the agent can connect.

## Run

```powershell
npm install
$env:NETLINK_SERVER_URL="ws://127.0.0.1:4000"
$env:NETLINK_PAIRED_DEVICE_ID="approved-paired-device-id"
npm start
```

The agent authenticates the server challenge with its local private key. The server validates the key against the approved paired device and terminates connections after revocation.

After authentication the agent sends `HEARTBEAT` messages at `NETLINK_AGENT_HEARTBEAT_INTERVAL_MS` (default 10 seconds). The server acknowledges valid heartbeats, records last-seen state, and ends active sessions plus queued operations after the configured timeout (`AGENT_HEARTBEAT_TIMEOUT_MS`, default 30 seconds). Heartbeats contain no private key material.

## Supported operation

- `GET_SYSTEM_INFO`: returns platform, OS release, hostname, CPU count, memory size, uptime, and network interfaces.

The agent explicitly returns `UNSUPPORTED` for screen capture, remote input, media controls, and file transfer until platform-specific implementations and permission handling are added. It contains no shell, command, process, or arbitrary filesystem execution endpoint.
