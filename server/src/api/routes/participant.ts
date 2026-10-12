import express, { Router } from "express";
import { HttpError } from "../../lib/errors.ts";
import { sniffImage } from "../../lib/image.ts";
import type { Context } from "../context.ts";
import { avatarUrl, toPerson } from "../present.ts";

const AVATAR_MAX_BYTES = 1024 * 1024;

/** Routes for a joined participant (x-participant-token). Mounted at /api/sessions. */
export function participantRoutes({ repo, requireParticipant }: Context) {
  const router = Router();

  // A participant sees only their own assignment.
  router.get("/:id/me", (req, res) => {
    const { session, me } = requireParticipant(req);
    const giftee = repo.assignments.receiverOf(me.id);
    res.json({
      participantId: me.id,
      name: me.name,
      avatarUrl: avatarUrl(session.id, me),
      status: session.status,
      giftTo: giftee ? toPerson(session.id, giftee) : null,
    });
  });

  // Profile photo. The browser shrinks it to a small square JPEG before upload.
  router.put("/:id/me/avatar", express.raw({ type: () => true, limit: AVATAR_MAX_BYTES }), (req, res) => {
    const { session, me } = requireParticipant(req);
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (data.length === 0) throw new HttpError(400, "Photo is required");
    const type = sniffImage(data);
    if (!type) throw new HttpError(415, "Use a JPEG, PNG or WebP photo");
    repo.participants.setAvatar(me.id, data, type);
    res.json({ avatarUrl: avatarUrl(session.id, { ...me, has_avatar: 1, avatar_version: me.avatar_version + 1 }) });
  });

  router.delete("/:id/me/avatar", (req, res) => {
    const { me } = requireParticipant(req);
    repo.participants.clearAvatar(me.id);
    res.status(204).end();
  });

  return router;
}
