import type { Request } from "express";
import type { Repository } from "../db/index.ts";
import { createSecretSanta } from "../domain/secretSanta.ts";
import { HttpError } from "../lib/errors.ts";
import { safeEqual } from "../lib/tokens.ts";

/** Everything a router needs: the data, the rules, and who is calling. */
export function createContext(repo: Repository) {
  const santa = createSecretSanta(repo);

  /** The session in `:id`, if the caller holds its admin token. */
  const requireAdmin = (req: Request) => {
    const session = santa.findSession(String(req.params.id));
    if (!safeEqual(req.get("x-admin-token"), session.admin_token)) throw new HttpError(403, "Admin token required");
    return session;
  };

  /** The session in `:id` and the participant whose token the caller holds. */
  const requireParticipant = (req: Request) => {
    const session = santa.findSession(String(req.params.id));
    const me = repo.participants.findByToken(session.id, req.get("x-participant-token") ?? "");
    if (!me) throw new HttpError(403, "Not a participant of this session");
    return { session, me };
  };

  return { repo, santa, requireAdmin, requireParticipant };
}

export type Context = ReturnType<typeof createContext>;
