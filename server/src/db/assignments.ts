import type { DatabaseSync } from "node:sqlite";
import { PERSON_COLUMNS, type PersonRow } from "./participants.ts";

export function assignmentsRepo(db: DatabaseSync) {
  return {
    /** Giver id → receiver id. */
    all: (sessionId: string) =>
      new Map(
        (db.prepare("SELECT giver_id, receiver_id FROM assignments WHERE session_id = ?").all(sessionId) as {
          giver_id: number;
          receiver_id: number;
        }[]).map((a) => [a.giver_id, a.receiver_id]),
      ),

    receiverOf: (giverId: number) =>
      db
        .prepare(
          `SELECT ${PERSON_COLUMNS} FROM participants
           WHERE id = (SELECT receiver_id FROM assignments WHERE giver_id = ?)`,
        )
        .get(giverId) as PersonRow | undefined,

    save: (sessionId: string, pairs: Map<number, number>) => {
      const insert = db.prepare("INSERT INTO assignments (session_id, giver_id, receiver_id) VALUES (?, ?, ?)");
      for (const [giver, receiver] of pairs) insert.run(sessionId, giver, receiver);
    },

    clear: (sessionId: string) => {
      db.prepare("DELETE FROM assignments WHERE session_id = ?").run(sessionId);
    },
  };
}
