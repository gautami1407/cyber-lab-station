-- AlterTable
ALTER TABLE "FileTransfer" ADD COLUMN "operationId" TEXT,
ADD COLUMN "remotePath" TEXT,
ADD COLUMN "reason" TEXT,
ADD COLUMN "sha256" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "FileTransfer_operationId_key" ON "FileTransfer"("operationId");

-- CreateIndex
CREATE INDEX "FileTransfer_userId_status_idx" ON "FileTransfer"("userId", "status");