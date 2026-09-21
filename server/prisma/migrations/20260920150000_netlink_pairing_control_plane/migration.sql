CREATE TABLE "PairingRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "PairingRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PairedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PairedDevice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RemoteSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pairedDeviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "RemoteSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RemoteOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pairedDeviceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REJECTED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RemoteOperation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FileTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pairedDeviceId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "safeName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REJECTED',
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PairedDevice_requestId_key" ON "PairedDevice"("requestId");
CREATE INDEX "PairingRequest_userId_status_createdAt_idx" ON "PairingRequest"("userId", "status", "createdAt");
CREATE INDEX "PairedDevice_userId_status_idx" ON "PairedDevice"("userId", "status");
CREATE INDEX "RemoteSession_userId_status_idx" ON "RemoteSession"("userId", "status");
CREATE INDEX "RemoteOperation_userId_createdAt_idx" ON "RemoteOperation"("userId", "createdAt");
CREATE INDEX "FileTransfer_userId_createdAt_idx" ON "FileTransfer"("userId", "createdAt");
ALTER TABLE "PairingRequest" ADD CONSTRAINT "PairingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PairedDevice" ADD CONSTRAINT "PairedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PairedDevice" ADD CONSTRAINT "PairedDevice_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PairingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteSession" ADD CONSTRAINT "RemoteSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteSession" ADD CONSTRAINT "RemoteSession_pairedDeviceId_fkey" FOREIGN KEY ("pairedDeviceId") REFERENCES "PairedDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteOperation" ADD CONSTRAINT "RemoteOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteOperation" ADD CONSTRAINT "RemoteOperation_pairedDeviceId_fkey" FOREIGN KEY ("pairedDeviceId") REFERENCES "PairedDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteOperation" ADD CONSTRAINT "RemoteOperation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RemoteSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileTransfer" ADD CONSTRAINT "FileTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileTransfer" ADD CONSTRAINT "FileTransfer_pairedDeviceId_fkey" FOREIGN KEY ("pairedDeviceId") REFERENCES "PairedDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;