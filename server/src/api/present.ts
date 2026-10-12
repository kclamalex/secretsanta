import type { PersonRow, SessionRow } from "../db/index.ts";

/** Database rows → JSON shapes the web app reads. */

// The version in the URL changes on every upload, so browsers can cache each photo forever.
export const avatarUrl = (sessionId: string, row: PersonRow) =>
  row.has_avatar ? `/api/sessions/${sessionId}/participants/${row.id}/avatar?v=${row.avatar_version}` : null;

export const toPerson = (sessionId: string, row: PersonRow) => ({
  id: row.id,
  name: row.name,
  avatarUrl: avatarUrl(sessionId, row),
});

export const toSession = (session: SessionRow, people: PersonRow[]) => ({
  id: session.id,
  name: session.name,
  status: session.status,
  participants: people.map((row) => toPerson(session.id, row)),
});
