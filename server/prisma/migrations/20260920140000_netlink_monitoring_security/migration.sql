CREATE TABLE "MonitoringConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonitoringConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "deviceId" TEXT,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonitoringConfig_userId_key" ON "MonitoringConfig"("userId");
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");
CREATE INDEX "SecurityEvent_deviceId_createdAt_idx" ON "SecurityEvent"("deviceId", "createdAt");
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");
CREATE INDEX "SecurityAlert_userId_status_createdAt_idx" ON "SecurityAlert"("userId", "status", "createdAt");
CREATE INDEX "SecurityAlert_deviceId_createdAt_idx" ON "SecurityAlert"("deviceId", "createdAt");

ALTER TABLE "MonitoringConfig" ADD CONSTRAINT "MonitoringConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;