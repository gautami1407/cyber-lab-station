CREATE TABLE "AuthorizedNetwork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interfaceName" TEXT NOT NULL,
    "ipv4Address" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "gateway" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthorizedNetwork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NetworkInterface" (
    "id" TEXT NOT NULL,
    "authorizedNetworkId" TEXT,
    "name" TEXT NOT NULL,
    "ipv4Address" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "gateway" TEXT,
    "macAddress" TEXT,
    "isUp" BOOLEAN NOT NULL DEFAULT true,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkInterface_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorizedNetworkId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT,
    "hostname" TEXT,
    "vendor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latencyMs" INTEGER,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceObservation" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT,
    "hostname" TEXT,
    "latencyMs" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorizedNetwork_userId_cidr_key" ON "AuthorizedNetwork"("userId", "cidr");
CREATE INDEX "AuthorizedNetwork_userId_status_idx" ON "AuthorizedNetwork"("userId", "status");
CREATE INDEX "NetworkInterface_authorizedNetworkId_idx" ON "NetworkInterface"("authorizedNetworkId");
CREATE INDEX "NetworkInterface_ipv4Address_idx" ON "NetworkInterface"("ipv4Address");
CREATE UNIQUE INDEX "Device_userId_ipAddress_key" ON "Device"("userId", "ipAddress");
CREATE INDEX "Device_userId_status_idx" ON "Device"("userId", "status");
CREATE INDEX "Device_authorizedNetworkId_lastSeen_idx" ON "Device"("authorizedNetworkId", "lastSeen");
CREATE INDEX "DeviceObservation_deviceId_observedAt_idx" ON "DeviceObservation"("deviceId", "observedAt");

ALTER TABLE "AuthorizedNetwork" ADD CONSTRAINT "AuthorizedNetwork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NetworkInterface" ADD CONSTRAINT "NetworkInterface_authorizedNetworkId_fkey" FOREIGN KEY ("authorizedNetworkId") REFERENCES "AuthorizedNetwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_authorizedNetworkId_fkey" FOREIGN KEY ("authorizedNetworkId") REFERENCES "AuthorizedNetwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceObservation" ADD CONSTRAINT "DeviceObservation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;