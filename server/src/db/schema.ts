import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      admin_token TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drawn')),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS participants (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      token      TEXT NOT NULL,
      avatar         BLOB,
      avatar_type    TEXT,
      avatar_version INTEGER NOT NULL DEFAULT 0,
      UNIQUE (session_id, name COLLATE NOCASE)
    );

    CREATE TABLE IF NOT EXISTS exclusions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      giver_id    INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      UNIQUE (giver_id, receiver_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      giver_id    INTEGER PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE
    );
  `);

  // Databases created before profile photos existed need the avatar columns added.
  const columns = db.prepare("PRAGMA table_info(participants)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "avatar")) {
    db.exec(`
      ALTER TABLE participants ADD COLUMN avatar BLOB;
      ALTER TABLE participants ADD COLUMN avatar_type TEXT;
      ALTER TABLE participants ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
    `);
  }
  return db;
}
