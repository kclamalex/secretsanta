import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../lib/sqlite.ts";
import { assignmentsRepo } from "./assignments.ts";
import { exclusionsRepo } from "./exclusions.ts";
import { participantsRepo } from "./participants.ts";
import { sessionsRepo } from "./sessions.ts";

export { openDb } from "./schema.ts";
export type { SessionRow, Status } from "./sessions.ts";
export type { PersonRow } from "./participants.ts";
export type { Exclusion } from "./exclusions.ts";

/** Every query the app runs, grouped by table. Nothing above this layer writes SQL. */
export function createRepository(db: DatabaseSync) {
  return {
    sessions: sessionsRepo(db),
    participants: participantsRepo(db),
    exclusions: exclusionsRepo(db),
    assignments: assignmentsRepo(db),
    transaction: <T>(fn: () => T) => transaction(db, fn),
  };
}

export type Repository = ReturnType<typeof createRepository>;
