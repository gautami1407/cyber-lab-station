CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScanResult" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "responseTimeMs" INTEGER,
    CONSTRAINT "ScanResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceObservation" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "scanId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "responseTimeMs" INTEGER,
    CONSTRAINT "ServiceObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Scan_userId_createdAt_idx" ON "Scan"("userId", "createdAt");
CREATE INDEX "Scan_deviceId_createdAt_idx" ON "Scan"("deviceId", "createdAt");
CREATE UNIQUE INDEX "ScanResult_scanId_port_protocol_key" ON "ScanResult"("scanId", "port", "protocol");
CREATE INDEX "ScanResult_scanId_status_idx" ON "ScanResult"("scanId", "status");
CREATE UNIQUE INDEX "Service_deviceId_port_protocol_key" ON "Service"("deviceId", "port", "protocol");
CREATE INDEX "Service_deviceId_status_idx" ON "Service"("deviceId", "status");
CREATE INDEX "ServiceObservation_serviceId_observedAt_idx" ON "ServiceObservation"("serviceId", "observedAt");
CREATE INDEX "ServiceObservation_scanId_idx" ON "ServiceObservation"("scanId");

ALTER TABLE "Scan" ADD CONSTRAINT "Scan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceObservation" ADD CONSTRAINT "ServiceObservation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceObservation" ADD CONSTRAINT "ServiceObservation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;