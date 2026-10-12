import { Router } from "express";
import { requireId } from "../../lib/validate.ts";
import type { Context } from "../context.ts";
import { toSession } from "../present.ts";

/** Routes for the session's creator (x-admin-token). Mounted at /api/sessions. */
export function adminRoutes({ repo, santa, requireAdmin }: Context) {
  const router = Router();

  router.get("/:id/admin", (req, res) => {
    const session = requireAdmin(req);
    res.json({ ...toSession(session, repo.participants.list(session.id)), exclusions: repo.exclusions.list(session.id) });
  });

  router.delete("/:id/participants/:pid", (req, res) => {
    santa.removeParticipant(requireAdmin(req), requireId(req.params.pid, "Participant"));
    res.status(204).end();
  });

  router.post("/:id/exclusions", (req, res) => {
    const session = requireAdmin(req);
    const giverId = requireId(req.body?.giverId, "Giver");
    const receiverId = requireId(req.body?.receiverId, "Receiver");
    santa.addRule(session, giverId, receiverId, Boolean(req.body?.both));
    res.status(201).json({ exclusions: repo.exclusions.list(session.id) });
  });

  router.delete("/:id/exclusions/:eid", (req, res) => {
    santa.removeRule(requireAdmin(req), requireId(req.params.eid, "Rule"));
    res.status(204).end();
  });

  router.post("/:id/draw", (req, res) => {
    santa.draw(requireAdmin(req));
    res.json({ status: "drawn" });
  });

  router.post("/:id/reset", (req, res) => {
    santa.reset(requireAdmin(req));
    res.json({ status: "open" });
  });

  return router;
}
