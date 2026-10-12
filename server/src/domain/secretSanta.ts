import type { Repository, SessionRow } from "../db/index.ts";
import { HttpError } from "../lib/errors.ts";
import { pick } from "../lib/random.ts";
import { randomCode, randomToken } from "../lib/tokens.ts";
import { draw } from "./draw.ts";

// No 0/O/1/I/L so codes are easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MIN_PARTICIPANTS = 3;

/** The Secret Santa rules: what may happen to a session, and when. Knows nothing about HTTP routes. */
export function createSecretSanta(repo: Repository) {
  const findSession = (id: string): SessionRow => {
    const session = repo.sessions.find(id);
    if (!session) throw new HttpError(404, "Session not found");
    return session;
  };

  const requireOpen = (session: SessionRow) => {
    if (session.status !== "open") throw new HttpError(409, "Names have already been drawn. Reset the draw first.");
  };

  const requireParticipant = (session: SessionRow, participantId: number) => {
    if (!repo.participants.exists(session.id, participantId)) throw new HttpError(404, "Participant not found");
  };

  const participantIds = (session: SessionRow) => repo.participants.list(session.id).map((p) => p.id);

  return {
    findSession,

    createSession(name: string) {
      let id = randomCode(CODE_ALPHABET, CODE_LENGTH);
      while (repo.sessions.exists(id)) id = randomCode(CODE_ALPHABET, CODE_LENGTH);
      const adminToken = randomToken();
      repo.sessions.create(id, name, adminToken);
      return { id, name, adminToken };
    },

    join(session: SessionRow, name: string) {
      requireOpen(session);
      const token = randomToken();
      try {
        return { participantId: repo.participants.add(session.id, name, token), name, token };
      } catch (err) {
        if (String(err).includes("UNIQUE")) throw new HttpError(409, `Someone named "${name}" already joined`);
        throw err;
      }
    },

    removeParticipant(session: SessionRow, participantId: number) {
      requireOpen(session);
      requireParticipant(session, participantId);
      repo.participants.remove(participantId);
    },

    /** Giver can't get receiver. `both` also blocks the reverse. */
    addRule(session: SessionRow, giverId: number, receiverId: number, both: boolean) {
      requireOpen(session);
      if (giverId === receiverId) throw new HttpError(400, "Pick two different people");
      requireParticipant(session, giverId);
      requireParticipant(session, receiverId);
      repo.transaction(() => {
        repo.exclusions.add(session.id, giverId, receiverId);
        if (both) repo.exclusions.add(session.id, receiverId, giverId);
      });
    },

    removeRule(session: SessionRow, ruleId: number) {
      requireOpen(session);
      repo.exclusions.remove(session.id, ruleId);
    },

    draw(session: SessionRow) {
      requireOpen(session);
      const ids = participantIds(session);
      if (ids.length < MIN_PARTICIPANTS) throw new HttpError(400, `Need at least ${MIN_PARTICIPANTS} participants to draw`);
      const result = draw(ids, repo.exclusions.list(session.id));
      if (!result) throw new HttpError(422, "No valid draw exists with these rules. Remove a rule and try again.");
      repo.transaction(() => {
        repo.assignments.save(session.id, result);
        repo.sessions.setStatus(session.id, "drawn");
      });
    },

    reset(session: SessionRow) {
      repo.transaction(() => {
        repo.assignments.clear(session.id);
        repo.sessions.setStatus(session.id, "open");
      });
    },

    // ---- Test mode: bulk fake data ----

    /** Adds `count` people named "Test n", skipping names already taken. */
    addFakePeople(session: SessionRow, count: number) {
      requireOpen(session);
      const taken = new Set(repo.participants.list(session.id).map((p) => p.name.toLowerCase()));
      repo.transaction(() => {
        for (let n = 1, added = 0; added < count; n++) {
          const name = `Test ${n}`;
          if (taken.has(name.toLowerCase())) continue;
          repo.participants.add(session.id, name, randomToken());
          added++;
        }
      });
    },

    /** Random one-way rules between existing people. */
    addRandomRules(session: SessionRow, count: number) {
      requireOpen(session);
      const ids = participantIds(session);
      if (ids.length < 2) throw new HttpError(400, "Add people first");
      repo.transaction(() => {
        for (let added = 0, tries = 0; added < count && tries < count * 20; tries++) {
          const [giver, receiver] = [pick(ids), pick(ids)];
          if (giver !== receiver && repo.exclusions.add(session.id, giver, receiver)) added++;
        }
      });
    },

    clearRules(session: SessionRow) {
      requireOpen(session);
      repo.exclusions.clear(session.id);
    },
  };
}

export type SecretSanta = ReturnType<typeof createSecretSanta>;
