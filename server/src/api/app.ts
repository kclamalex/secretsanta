import express from "express";
import type { DatabaseSync } from "node:sqlite";
import { createRepository } from "../db/index.ts";
import { errorHandler, notFound, privateNetworkOnly } from "../lib/http.ts";
import { createContext } from "./context.ts";
import { adminRoutes } from "./routes/admin.ts";
import { participantRoutes } from "./routes/participant.ts";
import { publicRoutes } from "./routes/public.ts";
import { testModeRoutes } from "./routes/testMode.ts";

/** `testMode` adds /api/test/* routes for bulk fake data and checking draws. Never enable it for a real party. */
export function createApp(db: DatabaseSync, { testMode = false } = {}) {
  const ctx = createContext(createRepository(db));
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/sessions", publicRoutes(ctx), participantRoutes(ctx), adminRoutes(ctx));
  // Test routes expose every match, so they pretend not to exist for anything off the private network.
  if (testMode) app.use("/api/test", privateNetworkOnly, testModeRoutes(ctx));

  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
