import { Router } from "express";
import { HttpError } from "../../lib/errors.ts";
import { requireId, requireText } from "../../lib/validate.ts";
import type { Context } from "../context.ts";
import { toSession } from "../present.ts";

/** Routes anyone with the session code may call. Mounted at /api/sessions. */
export function publicRoutes({ repo, santa }: Context) {
  const router = Router();

  // Create a session. The creator gets the admin token.
  router.post("/", (req, res) => {
    res.status(201).json(santa.createSession(requireText(req.body?.name, "Session name")));
  });

  // Who has joined so far.
  router.get("/:id", (req, res) => {
    const session = santa.findSession(req.params.id);
    res.json(toSession(session, repo.participants.list(session.id)));
  });

  router.post("/:id/join", (req, res) => {
    const session = santa.findSession(req.params.id);
    res.status(201).json(santa.join(session, requireText(req.body?.name, "name")));
  });

  router.get("/:id/participants/:pid/avatar", (req, res) => {
    const session = santa.findSession(req.params.id);
    const photo = repo.participants.avatar(session.id, requireId(req.params.pid, "Participant"));
    if (!photo) throw new HttpError(404, "No photo");
    res
      .set({ "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" })
      .type(photo.avatar_type)
      .send(Buffer.from(photo.avatar));
  });

  return router;
}
