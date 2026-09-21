ALTER TABLE "PairedDevice" ADD COLUMN "connectionStatus" TEXT NOT NULL DEFAULT 'DISCONNECTED';
ALTER TABLE "PairedDevice" ADD COLUMN "lastSeen" TIMESTAMP(3);
ALTER TABLE "PairedDevice" ADD COLUMN "lastHeartbeat" TIMESTAMP(3);
CREATE INDEX "PairedDevice_connectionStatus_lastSeen_idx" ON "PairedDevice"("connectionStatus", "lastSeen");