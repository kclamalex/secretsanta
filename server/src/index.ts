import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const dbPath = process.env.DB_PATH ?? resolve("data/secretsanta.db");
const publicDir = resolve(process.env.PUBLIC_DIR ?? "dist/public");

const testMode = ["1", "true"].includes(process.env.TEST_MODE ?? "");

const app = createApp(openDb(dbPath), { testMode });
if (testMode) console.log("⚠️  TEST MODE is on: /test can bulk-add fake people and show every match");

// Serve the built React app and fall back to index.html for client routes.
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve(publicDir, "index.html")));
}

app.listen(port, host, () => console.log(`Secret Santa listening on http://${host}:${port}`));
