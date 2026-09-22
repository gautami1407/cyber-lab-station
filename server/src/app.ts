import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config, isProduction } from "./config.js";
import { Errors } from "./errors.js";
import { csrfOrigin } from "./middleware/auth.js";
import { csrfProtect, issueCsrfToken } from "./middleware/csrf.js";
import { errorHandler, ok } from "./middleware/error.js";
import { prisma } from "./prisma.js";
import authRoutes from "./routes/auth.js";
import opsRoutes from "./routes/ops.js";
import securityRoutes from "./routes/security.js";
import networkRoutes from "./routes/network.js";
import diagnosticsRoutes from "./routes/diagnostics.js";
import monitoringRoutes from "./routes/monitoring.js";
import pairingRoutes from "./routes/pairing.js";
import auditRoutes from "./routes/audit.js";

async function checkDatabaseConnection() {
  if (!config.databaseUrl) return false;
  return prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: "no-referrer" },
      hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    }),
  );
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, _res, next) => next(Errors.rateLimited()),
    }),
  );
  app.use(csrfOrigin);

  app.get("/api/csrf", (_req, res) => {
    ok(res, { csrfToken: issueCsrfToken(res) });
  });

  app.get("/health", async (_req, res) => {
    const database = await checkDatabaseConnection();
    if (!database) {
      res.status(200).json({
        success: false,
        error: { code: "DATABASE_UNAVAILABLE", message: "Database unavailable." },
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        status: "ok",
        database: "connected",
      },
    });
  });

  app.get("/api/health", async (_req, res) => {
    const database = await checkDatabaseConnection();
    if (!database) {
      res.status(200).json({
        success: false,
        error: { code: "DATABASE_UNAVAILABLE", message: "Database unavailable." },
      });
      return;
    }
    ok(res, {
      status: "ok",
      api: true,
      database: true,
      labMode: true,
      apiVersion: config.apiVersion,
      environment: config.nodeEnv,
    });
  });

  app.use(csrfProtect);
  app.use("/api/auth", authRoutes);
  app.use("/api", opsRoutes);
  app.use("/api", securityRoutes);
  app.use("/api", networkRoutes);
  app.use("/api", diagnosticsRoutes);
  app.use("/api", monitoringRoutes);
  app.use("/api", pairingRoutes);
  app.use("/api", auditRoutes);

  app.use(errorHandler);
  return app;
}
