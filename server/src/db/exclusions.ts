import type { DatabaseSync } from "node:sqlite";

export type Exclusion = { id: number; giverId: number; receiverId: number };

export function exclusionsRepo(db: DatabaseSync) {
  return {
    list: (sessionId: string) =>
      (db.prepare("SELECT id, giver_id, receiver_id FROM exclusions WHERE session_id = ? ORDER BY id").all(sessionId) as {
        id: number;
        giver_id: number;
        receiver_id: number;
      }[]).map((e): Exclusion => ({ id: e.id, giverId: e.giver_id, receiverId: e.receiver_id })),

    /** True if the rule is new; an existing one is left alone. */
    add: (sessionId: string, giverId: number, receiverId: number) =>
      db
        .prepare("INSERT OR IGNORE INTO exclusions (session_id, giver_id, receiver_id) VALUES (?, ?, ?)")
        .run(sessionId, giverId, receiverId).changes > 0,

    remove: (sessionId: string, id: number) => {
      db.prepare("DELETE FROM exclusions WHERE id = ? AND session_id = ?").run(id, sessionId);
    },

    clear: (sessionId: string) => {
      db.prepare("DELETE FROM exclusions WHERE session_id = ?").run(sessionId);
    },
  };
}
