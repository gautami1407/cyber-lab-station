import { describe, expect, it } from "vitest";
import { cleanupScreenStream, createScreenStreamState, enforceScreenStreamBackpressure, getActiveScreenStreamForSession, reconstructScreenStreamPayload, registerScreenStreamState, transitionScreenStreamState, validateScreenStreamFrame, validateScreenStreamOwnership } from "./realtime.js";
import { prisma } from "./prisma.js";
import { requestRemoteOperation, startRemoteSession } from "./services/pairing.js";

describe("screen stream state machine", () => {
  it("rejects invalid transitions and keeps a single active state", () => {
    const stream = createScreenStreamState({
      streamId: "stream-state-test",
      userId: "user-a",
      pairedDeviceId: "device-a",
      sessionId: "session-a",
      operationId: "op-a",
    });

    expect(transitionScreenStreamState(stream, "STARTING").status).toBe("STARTING");
    expect(transitionScreenStreamState(stream, "STREAMING").status).toBe("STREAMING");
    expect(() => transitionScreenStreamState(stream, "STREAMING")).toThrow(/invalid stream transition/i);
    expect(() => transitionScreenStreamState(stream, "FRAME")).toThrow(/invalid stream transition/i);
    expect(transitionScreenStreamState(stream, "STOPPING").status).toBe("STOPPING");
    expect(transitionScreenStreamState(stream, "STOPPED").status).toBe("STOPPED");
  });

  it("bounds pending frames and drops stale work when the queue is full", () => {
    const stream = createScreenStreamState({
      streamId: "stream-backpressure-test",
      userId: "user-a",
      pairedDeviceId: "device-a",
      sessionId: "session-a",
      operationId: "op-b",
    });

    const pushed = [] as Array<{ frameId: string; createdAt: number }>;
    for (let index = 0; index < 10; index += 1) {
      pushed.push({ frameId: `frame-${index}`, createdAt: index + 1 });
      enforceScreenStreamBackpressure(stream, { frameId: `frame-${index}`, createdAt: index + 1 });
    }

    expect(stream.pendingFrames.length).toBeLessThanOrEqual(3);
    expect(stream.framesDropped).toBeGreaterThan(0);
  });
});

describe("screen stream security and lifecycle", () => {
  it("rejects cross-user and spoofed stream ownership", () => {
    const stream = createScreenStreamState({ streamId: "stream-secure", userId: "user-a", pairedDeviceId: "device-a", sessionId: "session-a", operationId: "op-secure" });
    expect(validateScreenStreamOwnership(stream, "user-a", "device-a", "session-a")).toBe(true);
    expect(validateScreenStreamOwnership(stream, "user-b", "device-a", "session-a")).toBe(false);
    expect(validateScreenStreamOwnership(stream, "user-a", "device-b", "session-a")).toBe(false);
    expect(validateScreenStreamOwnership(stream, "user-a", "device-a", "session-b")).toBe(false);
    expect(validateScreenStreamOwnership(undefined, "user-a", "device-a", "session-a")).toBe(false);

    const frameOk = validateScreenStreamFrame(stream, { streamId: "stream-secure", frameId: "frame-1", pairedDeviceId: "device-a", sessionId: "session-a", userId: "user-a", chunkIndex: 0, totalChunks: 2, payload: "AQ==", totalBytes: 64 }, "device-a");
    expect(frameOk.ok).toBe(true);
    expect(validateScreenStreamFrame(stream, { streamId: "stream-secure", frameId: "frame-1", pairedDeviceId: "device-b", sessionId: "session-a", userId: "user-a", chunkIndex: 0, totalChunks: 2, payload: "AQ==", totalBytes: 64 }, "device-a").ok).toBe(false);
  });

  it("rejects malformed stream frames and cleans up safely", async () => {
    const stream = createScreenStreamState({ streamId: "stream-invalid", userId: "user-a", pairedDeviceId: "device-a", sessionId: "session-a", operationId: "op-invalid" });
    stream.status = "STREAMING";
    const rejects = [
      { streamId: "missing", frameId: "f-1", pairedDeviceId: "device-a", sessionId: "session-a", userId: "user-a", chunkIndex: 0, totalChunks: 2, payload: "AQ==", totalBytes: 64 },
      { streamId: "stream-invalid", frameId: "f-1", pairedDeviceId: "device-b", sessionId: "session-a", userId: "user-a", chunkIndex: 0, totalChunks: 2, payload: "AQ==", totalBytes: 64 },
      { streamId: "stream-invalid", frameId: "f-1", pairedDeviceId: "device-a", sessionId: "session-a", userId: "user-a", chunkIndex: 2, totalChunks: 2, payload: "AQ==", totalBytes: 64 },
      { streamId: "stream-invalid", frameId: "f-1", pairedDeviceId: "device-a", sessionId: "session-a", userId: "user-a", chunkIndex: 0, totalChunks: 0, payload: "AQ==", totalBytes: 64 },
      { streamId: "stream-invalid", frameId: "f-1", pairedDeviceId: "device-a", sessionId: "session-a", userId: "user-a", chunkIndex: 0, totalChunks: 2, payload: "", totalBytes: 64 },
    ];
    for (const input of rejects) {
      const result = validateScreenStreamFrame(stream, input, "device-a");
      expect(result.ok).toBe(false);
    }
    await expect(cleanupScreenStream("stream-invalid", "Protocol violation")).resolves.toBeUndefined();
    await expect(cleanupScreenStream("stream-invalid", "Protocol violation")).resolves.toBeUndefined();
  });

  it("rebuilds a full frame payload from ordered chunks and cleans up a stopped stream", async () => {
    const original = Buffer.from("Hello continuous stream world");
    const encoded = original.toString("base64");
    const chunked = new Map([
      [0, encoded.slice(0, 12)],
      [1, encoded.slice(12, 24)],
      [2, encoded.slice(24)],
    ]);
    expect(reconstructScreenStreamPayload({ totalChunks: 3, chunks: chunked, totalBytes: original.length })).toBe(encoded);

    const stream = createScreenStreamState({ streamId: "stream-rebuild", userId: "user-a", pairedDeviceId: "device-a", sessionId: "session-a", operationId: "op-rebuild" });
    stream.status = "STREAMING";
    expect(getActiveScreenStreamForSession("device-a", "session-a")).toBeUndefined();

    registerScreenStreamState({ streamId: "stream-rebuild", userId: "user-a", pairedDeviceId: "device-a", sessionId: "session-a", operationId: "op-rebuild" });
    expect(getActiveScreenStreamForSession("device-a", "session-a")?.streamId).toBe("stream-rebuild");

    await expect(cleanupScreenStream("stream-rebuild", "Stream stopped by client")).resolves.toBeUndefined();
    expect(getActiveScreenStreamForSession("device-a", "session-a")).toBeUndefined();
  });
});

describe("screen streaming authorization", () => {
  it("rejects unauthenticated and invalid stream start/stop requests", async () => {
    const user = await prisma.user.create({
      data: {
        username: `stream-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `stream-auth-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });
    const request = await prisma.pairingRequest.create({
      data: {
        userId: user.id,
        deviceName: "Auth Agent",
        publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAkR/QKccrPm0g7XzKrsgCfhF2pD+4f1kCZeqjnk7ffYw=\n-----END PUBLIC KEY-----",
        status: "PENDING",
      },
    });
    const paired = await prisma.pairedDevice.create({
      data: {
        userId: user.id,
        requestId: request.id,
        deviceName: "Auth Agent",
        publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAkR/QKccrPm0g7XzKrsgCfhF2pD+4f1kCZeqjnk7ffYw=\n-----END PUBLIC KEY-----",
        status: "PAIRED",
      },
    });
    const session = await startRemoteSession(user.id, paired.id, "127.0.0.1");

    await expect(requestRemoteOperation(user.id, paired.id, session.id, "SCREEN_STREAM", "127.0.0.1")).resolves.toMatchObject({ operation: "SCREEN_STREAM" });
    await expect(requestRemoteOperation(user.id, paired.id, "missing-session", "SCREEN_STREAM_STOP", "127.0.0.1")).rejects.toThrow();

    await prisma.remoteOperation.deleteMany({ where: { userId: user.id } });
    await prisma.remoteSession.deleteMany({ where: { userId: user.id } });
    await prisma.pairedDevice.delete({ where: { id: paired.id } });
    await prisma.pairingRequest.delete({ where: { id: request.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("allowlists SCREEN_STREAM for an active paired session", async () => {
    const user = await prisma.user.create({
      data: {
        username: `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `stream-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });
    const request = await prisma.pairingRequest.create({
      data: {
        userId: user.id,
        deviceName: "Stream Test Agent",
        publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAkR/QKccrPm0g7XzKrsgCfhF2pD+4f1kCZeqjnk7ffYw=\n-----END PUBLIC KEY-----",
        status: "PENDING",
      },
    });
    const paired = await prisma.pairedDevice.create({
      data: {
        userId: user.id,
        requestId: request.id,
        deviceName: "Stream Test Agent",
        publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAkR/QKccrPm0g7XzKrsgCfhF2pD+4f1kCZeqjnk7ffYw=\n-----END PUBLIC KEY-----",
        status: "PAIRED",
      },
    });
    const session = await startRemoteSession(user.id, paired.id, "127.0.0.1");

    const operation = await requestRemoteOperation(user.id, paired.id, session.id, "SCREEN_STREAM", "127.0.0.1");

    expect(operation.operation).toBe("SCREEN_STREAM");
    expect(operation.status).toBe("REJECTED");
    expect(operation.reason).toBe("No authenticated NetLink agent is connected.");

    await prisma.remoteOperation.deleteMany({ where: { userId: user.id } });
    await prisma.remoteSession.deleteMany({ where: { userId: user.id } });
    await prisma.pairedDevice.delete({ where: { id: paired.id } });
    await prisma.pairingRequest.delete({ where: { id: request.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("registers an active stream in the server registry for the authenticated session", async () => {
    const stream = registerScreenStreamState({
      streamId: "stream-registry-test",
      userId: "user-a",
      pairedDeviceId: "device-a",
      sessionId: "session-a",
      operationId: "op-stream-registry",
    });

    const active = getActiveScreenStreamForSession("device-a", "session-a");

    expect(stream.status).toBe("STARTING");
    expect(active).toBeTruthy();
    expect(active?.userId).toBe("user-a");
    expect(active?.pairedDeviceId).toBe("device-a");
    expect(active?.sessionId).toBe("session-a");

    await cleanupScreenStream(stream.streamId, "Test cleanup");
  });

  it("rejects unsupported stream operations before agent delivery", async () => {
    const user = await prisma.user.create({
      data: {
        username: `stream-unsupported-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `stream-unsupported-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });
    const request = await prisma.pairingRequest.create({
      data: {
        userId: user.id,
        deviceName: "Unsupported Agent",
        publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAkR/QKccrPm0g7XzKrsgCfhF2pD+4f1kCZeqjnk7ffYw=\n-----END PUBLIC KEY-----",
        status: "PENDING",
      },
    });
    const paired = await prisma.pairedDevice.create({
      data: {
        userId: user.id,
        requestId: request.id,
        deviceName: "Unsupported Agent",
        publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAkR/QKccrPm0g7XzKrsgCfhF2pD+4f1kCZeqjnk7ffYw=\n-----END PUBLIC KEY-----",
        status: "PAIRED",
      },
    });
    const session = await startRemoteSession(user.id, paired.id, "127.0.0.1");

    await expect(
      requestRemoteOperation(user.id, paired.id, session.id, "SCREEN_STREAM_FAKE", "127.0.0.1"),
    ).rejects.toThrow("Operation is not allowlisted.");

    await prisma.remoteSession.deleteMany({ where: { userId: user.id } });
    await prisma.pairedDevice.delete({ where: { id: paired.id } });
    await prisma.pairingRequest.delete({ where: { id: request.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
