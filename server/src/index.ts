import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

const app = createApp();

async function verifyDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Database connection: OK");
    return true;
  } catch {
    console.error("Database connection failed.");
    console.error("Check that PostgreSQL is running and DATABASE_URL is correct.");
    return false;
  }
}

const server = app.listen(config.port, async () => {
  console.log("CyberLab API starting...");
  await verifyDatabaseConnection();
  console.log(`Server listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
