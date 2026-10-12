import type { DatabaseSync } from "node:sqlite";

export type PersonRow = { id: number; name: string; has_avatar: number; avatar_version: number };

export const PERSON_COLUMNS = "id, name, avatar IS NOT NULL AS has_avatar, avatar_version";

export function participantsRepo(db: DatabaseSync) {
  return {
    list: (sessionId: string) =>
      db.prepare(`SELECT ${PERSON_COLUMNS} FROM participants WHERE session_id = ? ORDER BY id`).all(sessionId) as PersonRow[],

    findByToken: (sessionId: string, token: string) =>
      db.prepare(`SELECT ${PERSON_COLUMNS} FROM participants WHERE session_id = ? AND token = ?`).get(sessionId, token) as
        | PersonRow
        | undefined,

    exists: (sessionId: string, id: number) =>
      db.prepare("SELECT 1 FROM participants WHERE id = ? AND session_id = ?").get(id, sessionId) !== undefined,

    /** Throws a UNIQUE constraint error when the name is taken in this session (case-insensitive). */
    add: (sessionId: string, name: string, token: string) =>
      Number(
        db.prepare("INSERT INTO participants (session_id, name, token) VALUES (?, ?, ?)").run(sessionId, name, token)
          .lastInsertRowid,
      ),

    remove: (id: number) => {
      db.prepare("DELETE FROM participants WHERE id = ?").run(id);
    },

    tokens: (sessionId: string) =>
      new Map(
        (db.prepare("SELECT id, token FROM participants WHERE session_id = ?").all(sessionId) as {
          id: number;
          token: string;
        }[]).map((r) => [r.id, r.token]),
      ),

    // Bumping the version on every change gives each photo a fresh URL.
    setAvatar: (id: number, data: Buffer, type: string) => {
      db.prepare(
        "UPDATE participants SET avatar = ?, avatar_type = ?, avatar_version = avatar_version + 1 WHERE id = ?",
      ).run(data, type, id);
    },

    clearAvatar: (id: number) => {
      db.prepare(
        "UPDATE participants SET avatar = NULL, avatar_type = NULL, avatar_version = avatar_version + 1 WHERE id = ?",
      ).run(id);
    },

    avatar: (sessionId: string, id: number) =>
      db
        .prepare("SELECT avatar, avatar_type FROM participants WHERE id = ? AND session_id = ? AND avatar IS NOT NULL")
        .get(id, sessionId) as { avatar: Uint8Array; avatar_type: string } | undefined,
  };
}
