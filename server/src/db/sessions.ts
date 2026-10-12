import type { DatabaseSync } from "node:sqlite";

export type Status = "open" | "drawn";
export type SessionRow = { id: string; name: string; admin_token: string; status: Status };

export function sessionsRepo(db: DatabaseSync) {
  return {
    find: (id: string) =>
      db.prepare("SELECT id, name, admin_token, status FROM sessions WHERE id = ?").get(id.toUpperCase()) as
        | SessionRow
        | undefined,

    exists: (id: string) => db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(id) !== undefined,

    create: (id: string, name: string, adminToken: string) => {
      db.prepare("INSERT INTO sessions (id, name, admin_token) VALUES (?, ?, ?)").run(id, name, adminToken);
    },

    setStatus: (id: string, status: Status) => {
      db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
    },
  };
}
