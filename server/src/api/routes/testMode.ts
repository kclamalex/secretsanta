import { Router } from "express";
import { checkDraw } from "../../domain/draw.ts";
import { simulateDraws } from "../../domain/simulate.ts";
import { requireInt } from "../../lib/validate.ts";
import type { Context } from "../context.ts";
import { toPerson } from "../present.ts";

/** Bulk fake data and draw checks. Mounted at /api/test only when TEST_MODE=1, behind privateNetworkOnly. */
export function testModeRoutes({ repo, santa, requireAdmin }: Context) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ testMode: true });
  });

  router.post("/sessions/:id/people", (req, res) => {
    const session = requireAdmin(req);
    santa.addFakePeople(session, requireInt(req.body?.count, "Count", 1, 500));
    res.status(201).json({ participants: repo.participants.list(session.id).map((p) => toPerson(session.id, p)) });
  });

  router.post("/sessions/:id/rules", (req, res) => {
    const session = requireAdmin(req);
    santa.addRandomRules(session, requireInt(req.body?.count, "Count", 1, 5000));
    res.status(201).json({ exclusions: repo.exclusions.list(session.id).length });
  });

  router.delete("/sessions/:id/rules", (req, res) => {
    santa.clearRules(requireAdmin(req));
    res.status(204).end();
  });

  // The full draw with every participant's token, so the tester can open the reveal as anyone.
  router.get("/sessions/:id/draw", (req, res) => {
    const session = requireAdmin(req);
    const people = repo.participants.list(session.id);
    const tokens = repo.participants.tokens(session.id);
    const result = repo.assignments.all(session.id);
    const rules = repo.exclusions.list(session.id);
    res.json({
      people: people.map((p) => ({ ...toPerson(session.id, p), token: tokens.get(p.id), giftToId: result.get(p.id) ?? null })),
      rules: rules.length,
      problems: session.status === "drawn" ? checkDraw(people.map((p) => p.id), rules, result) : [],
    });
  });

  router.post("/sessions/:id/simulate", (req, res) => {
    const session = requireAdmin(req);
    const runs = requireInt(req.body?.runs, "Runs", 1, 10000);
    res.json(simulateDraws(repo.participants.list(session.id).map((p) => p.id), repo.exclusions.list(session.id), runs));
  });

  return router;
}
