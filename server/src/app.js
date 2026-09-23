import express from "express";
import cors from "cors";

import { webhooksRouter } from "./routes/webhooks.js";
import { releaseNotesRouter } from "./routes/releaseNotes.js";
import { notificationsRouter } from "./routes/notifications.js";
import { authRouter } from "./routes/auth.js";
import { flattenNavPaths } from "./lib/navAreas.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";

export function createApp() {
  const app = express();

  // Vercel terminates TLS upstream; without this req.ip and secure-cookie
  // logic see the proxy instead of the client.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const origins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: origins.includes("*") ? true : origins,
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // The webhook is mounted with express.raw() and BEFORE express.json(), because
  // the HMAC has to be computed over the exact bytes GitHub sent. Re-serialising
  // a parsed body would change them. body-parser marks the request as parsed, so
  // the express.json() below leaves this route alone.
  app.use(
    "/api/webhooks/github",
    express.raw({ type: "*/*", limit: "5mb" })
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // Nav taxonomy for the dashboard's path picker.
  app.get("/api/nav-paths", requireAuth, requireAdmin, (_req, res) =>
    res.json({ paths: flattenNavPaths() })
  );

  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/release-notes", releaseNotesRouter);
  app.use("/api/notifications", notificationsRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line no-unused-vars -- Express needs the 4-arg shape.
  app.use((err, _req, res, _next) => {
    console.error("[error]", err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error:
        status >= 500 && process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message || "Internal server error",
    });
  });

  return app;
}
