import express, { type NextFunction, type Request, type Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { BlockList, isIPv4 } from "node:net";
import { checkDraw, draw } from "./draw.ts";

type SessionRow = { id: string; name: string; admin_token: string; status: "open" | "drawn" };
type PersonRow = { id: number; name: string; has_avatar: number; avatar_version: number };
type ExclusionRow = { id: number; giver_id: number; receiver_id: number };

const PERSON_COLUMNS = "id, name, avatar IS NOT NULL AS has_avatar, avatar_version";
const AVATAR_MAX_BYTES = 1024 * 1024;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// No 0/O/1/I/L so codes are easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
const newToken = () => randomBytes(24).toString("base64url");

function sameToken(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cleanName(value: unknown, field = "name"): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} is required`);
  const name = value.trim();
  if (name.length > 60) throw new HttpError(400, `${field} must be at most 60 characters`);
  return name;
}

function toId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `${field} is invalid`);
  return id;
}

/** Identify an image by its magic bytes, so the declared content type can't lie. */
function sniffImage(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

// The version in the URL changes on every upload, so browsers can cache each photo forever.
const toPerson = (sessionId: string, row: PersonRow) => ({
  id: row.id,
  name: row.name,
  avatarUrl: row.has_avatar ? `/api/sessions/${sessionId}/participants/${row.id}/avatar?v=${row.avatar_version}` : null,
});

function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function toCount(value: unknown, field: string, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new HttpError(400, `${field} must be between 1 and ${max}`);
  return n;
}

// Loopback and private ranges: this machine, the Docker bridge, the home network.
const PRIVATE_NETWORKS = new BlockList();
for (const [net, prefix] of [["127.0.0.0", 8], ["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const) {
  PRIVATE_NETWORKS.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [["::1", 128], ["fc00::", 7], ["fe80::", 10]] as const) {
  PRIVATE_NETWORKS.addSubnet(net, prefix, "ipv6");
}
const PROXY_HEADERS = ["forwarded", "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip"];

/** True only for a direct connection from a private address. Anything relayed by a proxy or tunnel is public. */
function isPrivateRequest(req: Request): boolean {
  if (PROXY_HEADERS.some((h) => req.get(h) !== undefined)) return false;
  const address = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  if (!address) return false;
  return PRIVATE_NETWORKS.check(address, isIPv4(address) ? "ipv4" : "ipv6");
}

/** `testMode` adds /api/test/* routes for bulk fake data and checking draws. Never enable it for a real party. */
export function createApp(db: DatabaseSync, { testMode = false } = {}) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  const getSession = (id: string): SessionRow => {
    const row = db.prepare("SELECT id, name, admin_token, status FROM sessions WHERE id = ?").get(id.toUpperCase()) as
      | SessionRow
      | undefined;
    if (!row) throw new HttpError(404, "Session not found");
    return row;
  };

  const requireAdmin = (req: Request): SessionRow => {
    const session = getSession(String(req.params.id));
    if (!sameToken(req.get("x-admin-token"), session.admin_token)) throw new HttpError(403, "Admin token required");
    return session;
  };

  const requireOpen = (session: SessionRow) => {
    if (session.status !== "open") throw new HttpError(409, "Names have already been drawn. Reset the draw first.");
  };

  const requireParticipant = (req: Request) => {
    const session = getSession(String(req.params.id));
    const me = db
      .prepare(`SELECT ${PERSON_COLUMNS} FROM participants WHERE session_id = ? AND token = ?`)
      .get(session.id, req.get("x-participant-token") ?? "") as PersonRow | undefined;
    if (!me) throw new HttpError(403, "Not a participant of this session");
    return { session, me };
  };

  const listParticipants = (sessionId: string) =>
    (db.prepare(`SELECT ${PERSON_COLUMNS} FROM participants WHERE session_id = ? ORDER BY id`).all(
      sessionId,
    ) as PersonRow[]).map((row) => toPerson(sessionId, row));

  const listExclusions = (sessionId: string) =>
    (db.prepare("SELECT id, giver_id, receiver_id FROM exclusions WHERE session_id = ? ORDER BY id").all(
      sessionId,
    ) as ExclusionRow[]).map((e) => ({ id: e.id, giverId: e.giver_id, receiverId: e.receiver_id }));

  const participantInSession = (sessionId: string, participantId: number) => {
    const row = db.prepare("SELECT id FROM participants WHERE id = ? AND session_id = ?").get(participantId, sessionId);
    if (!row) throw new HttpError(404, "Participant not found");
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Create a session. The creator gets the admin token.
  app.post("/api/sessions", (req, res) => {
    const name = cleanName(req.body?.name, "Session name");
    const adminToken = newToken();
    let id = newCode();
    while (db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(id)) id = newCode();
    db.prepare("INSERT INTO sessions (id, name, admin_token) VALUES (?, ?, ?)").run(id, name, adminToken);
    res.status(201).json({ id, name, adminToken });
  });

  // Public view: who has joined so far.
  app.get("/api/sessions/:id", (req, res) => {
    const session = getSession(req.params.id);
    res.json({ id: session.id, name: session.name, status: session.status, participants: listParticipants(session.id) });
  });

  // Join a session by its code.
  app.post("/api/sessions/:id/join", (req, res) => {
    const session = getSession(req.params.id);
    requireOpen(session);
    const name = cleanName(req.body?.name);
    const token = newToken();
    try {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO participants (session_id, name, token) VALUES (?, ?, ?)")
        .run(session.id, name, token);
      res.status(201).json({ participantId: Number(lastInsertRowid), name, token });
    } catch (err) {
      if (String(err).includes("UNIQUE")) throw new HttpError(409, `Someone named "${name}" already joined`);
      throw err;
    }
  });

  // A participant sees only their own assignment.
  app.get("/api/sessions/:id/me", (req, res) => {
    const { session, me } = requireParticipant(req);
    const giftee = db
      .prepare(
        `SELECT ${PERSON_COLUMNS} FROM participants
         WHERE id = (SELECT receiver_id FROM assignments WHERE giver_id = ?)`,
      )
      .get(me.id) as PersonRow | undefined;
    const person = toPerson(session.id, me);
    res.json({
      participantId: person.id,
      name: person.name,
      avatarUrl: person.avatarUrl,
      status: session.status,
      giftTo: giftee ? toPerson(session.id, giftee) : null,
    });
  });

  // Profile photo. The browser shrinks it to a small square JPEG before upload.
  app.put(
    "/api/sessions/:id/me/avatar",
    express.raw({ type: () => true, limit: AVATAR_MAX_BYTES }),
    (req, res) => {
      const { session, me } = requireParticipant(req);
      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (data.length === 0) throw new HttpError(400, "Photo is required");
      const type = sniffImage(data);
      if (!type) throw new HttpError(415, "Use a JPEG, PNG or WebP photo");
      db.prepare(
        "UPDATE participants SET avatar = ?, avatar_type = ?, avatar_version = avatar_version + 1 WHERE id = ?",
      ).run(data, type, me.id);
      res.json({ avatarUrl: toPerson(session.id, { ...me, has_avatar: 1, avatar_version: me.avatar_version + 1 }).avatarUrl });
    },
  );

  app.delete("/api/sessions/:id/me/avatar", (req, res) => {
    const { me } = requireParticipant(req);
    db.prepare(
      "UPDATE participants SET avatar = NULL, avatar_type = NULL, avatar_version = avatar_version + 1 WHERE id = ?",
    ).run(me.id);
    res.status(204).end();
  });

  app.get("/api/sessions/:id/participants/:pid/avatar", (req, res) => {
    const session = getSession(req.params.id);
    const row = db
      .prepare("SELECT avatar, avatar_type FROM participants WHERE id = ? AND session_id = ? AND avatar IS NOT NULL")
      .get(toId(req.params.pid, "Participant"), session.id) as { avatar: Uint8Array; avatar_type: string } | undefined;
    if (!row) throw new HttpError(404, "No photo");
    res
      .set({ "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" })
      .type(row.avatar_type)
      .send(Buffer.from(row.avatar));
  });

  // ---- Admin ----

  app.get("/api/sessions/:id/admin", (req, res) => {
    const session = requireAdmin(req);
    res.json({
      id: session.id,
      name: session.name,
      status: session.status,
      participants: listParticipants(session.id),
      exclusions: listExclusions(session.id),
    });
  });

  app.delete("/api/sessions/:id/participants/:pid", (req, res) => {
    const session = requireAdmin(req);
    requireOpen(session);
    const pid = toId(req.params.pid, "Participant");
    participantInSession(session.id, pid);
    db.prepare("DELETE FROM participants WHERE id = ?").run(pid);
    res.status(204).end();
  });

  // Rule: giver can't get receiver. `both: true` also blocks the reverse.
  app.post("/api/sessions/:id/exclusions", (req, res) => {
    const session = requireAdmin(req);
    requireOpen(session);
    const giverId = toId(req.body?.giverId, "Giver");
    const receiverId = toId(req.body?.receiverId, "Receiver");
    if (giverId === receiverId) throw new HttpError(400, "Pick two different people");
    participantInSession(session.id, giverId);
    participantInSession(session.id, receiverId);
    const pairs = req.body?.both ? [[giverId, receiverId], [receiverId, giverId]] : [[giverId, receiverId]];
    transaction(db, () => {
      const insert = db.prepare(
        "INSERT OR IGNORE INTO exclusions (session_id, giver_id, receiver_id) VALUES (?, ?, ?)",
      );
      for (const [g, r] of pairs) insert.run(session.id, g, r);
    });
    res.status(201).json({ exclusions: listExclusions(session.id) });
  });

  app.delete("/api/sessions/:id/exclusions/:eid", (req, res) => {
    const session = requireAdmin(req);
    requireOpen(session);
    db.prepare("DELETE FROM exclusions WHERE id = ? AND session_id = ?").run(toId(req.params.eid, "Rule"), session.id);
    res.status(204).end();
  });

  app.post("/api/sessions/:id/draw", (req, res) => {
    const session = requireAdmin(req);
    requireOpen(session);
    const ids = listParticipants(session.id).map((p) => p.id);
    if (ids.length < 3) throw new HttpError(400, "Need at least 3 participants to draw");
    const result = draw(ids, listExclusions(session.id));
    if (!result) throw new HttpError(422, "No valid draw exists with these rules. Remove a rule and try again.");
    transaction(db, () => {
      const insert = db.prepare("INSERT INTO assignments (session_id, giver_id, receiver_id) VALUES (?, ?, ?)");
      for (const [giver, receiver] of result) insert.run(session.id, giver, receiver);
      db.prepare("UPDATE sessions SET status = 'drawn' WHERE id = ?").run(session.id);
    });
    res.json({ status: "drawn" });
  });

  app.post("/api/sessions/:id/reset", (req, res) => {
    const session = requireAdmin(req);
    transaction(db, () => {
      db.prepare("DELETE FROM assignments WHERE session_id = ?").run(session.id);
      db.prepare("UPDATE sessions SET status = 'open' WHERE id = ?").run(session.id);
    });
    res.json({ status: "open" });
  });

  if (testMode) {
    // Test routes expose every match, so they pretend not to exist for anything off the private network.
    app.use("/api/test", (req, _res, next) => next(isPrivateRequest(req) ? undefined : new HttpError(404, "Not found")));

    app.get("/api/test", (_req, res) => {
      res.json({ testMode: true });
    });

    app.post("/api/test/sessions/:id/people", (req, res) => {
      const session = requireAdmin(req);
      requireOpen(session);
      const count = toCount(req.body?.count, "Count", 500);
      const taken = new Set(listParticipants(session.id).map((p) => p.name.toLowerCase()));
      transaction(db, () => {
        const insert = db.prepare("INSERT INTO participants (session_id, name, token) VALUES (?, ?, ?)");
        for (let n = 1, added = 0; added < count; n++) {
          const name = `Test ${n}`;
          if (taken.has(name.toLowerCase())) continue;
          insert.run(session.id, name, newToken());
          added++;
        }
      });
      res.status(201).json({ participants: listParticipants(session.id) });
    });

    // Random one-way rules between existing people.
    app.post("/api/test/sessions/:id/rules", (req, res) => {
      const session = requireAdmin(req);
      requireOpen(session);
      const count = toCount(req.body?.count, "Count", 5000);
      const ids = listParticipants(session.id).map((p) => p.id);
      if (ids.length < 2) throw new HttpError(400, "Add people first");
      const pick = () => ids[randomInt(ids.length)];
      transaction(db, () => {
        const insert = db.prepare("INSERT OR IGNORE INTO exclusions (session_id, giver_id, receiver_id) VALUES (?, ?, ?)");
        for (let added = 0, tries = 0; added < count && tries < count * 20; tries++) {
          const [g, r] = [pick(), pick()];
          if (g !== r && insert.run(session.id, g, r).changes > 0) added++;
        }
      });
      res.status(201).json({ exclusions: listExclusions(session.id).length });
    });

    app.delete("/api/test/sessions/:id/rules", (req, res) => {
      const session = requireAdmin(req);
      requireOpen(session);
      db.prepare("DELETE FROM exclusions WHERE session_id = ?").run(session.id);
      res.status(204).end();
    });

    // The full draw with every participant's token, so the tester can open the reveal as anyone.
    app.get("/api/test/sessions/:id/draw", (req, res) => {
      const session = requireAdmin(req);
      const people = listParticipants(session.id);
      const tokens = new Map(
        (db.prepare("SELECT id, token FROM participants WHERE session_id = ?").all(session.id) as {
          id: number;
          token: string;
        }[]).map((r) => [r.id, r.token]),
      );
      const result = new Map(
        (db.prepare("SELECT giver_id, receiver_id FROM assignments WHERE session_id = ?").all(session.id) as {
          giver_id: number;
          receiver_id: number;
        }[]).map((a) => [a.giver_id, a.receiver_id]),
      );
      const ids = people.map((p) => p.id);
      res.json({
        people: people.map((p) => ({ ...p, token: tokens.get(p.id), giftToId: result.get(p.id) ?? null })),
        rules: listExclusions(session.id).length,
        problems: session.status === "drawn" ? checkDraw(ids, listExclusions(session.id), result) : [],
      });
    });

    // Runs the draw many times in memory (nothing is saved) and checks every result.
    app.post("/api/test/sessions/:id/simulate", (req, res) => {
      const session = requireAdmin(req);
      const runs = toCount(req.body?.runs, "Runs", 10000);
      const ids = listParticipants(session.id).map((p) => p.id);
      const rules = listExclusions(session.id);
      const started = performance.now();
      let valid = 0;
      let impossible = 0;
      const problems: string[] = [];
      const pairsSeen = new Set<string>();
      for (let i = 0; i < runs; i++) {
        const result = draw(ids, rules);
        if (!result) {
          impossible++;
          continue;
        }
        const found = checkDraw(ids, rules, result);
        if (found.length) problems.push(...found.slice(0, 3));
        else valid++;
        for (const [g, r] of result) pairsSeen.add(`${g}:${r}`);
      }
      // How much of the allowed space the draws covered: a sign the shuffle isn't stuck.
      const allowedPairs = ids.length * (ids.length - 1) - rules.length;
      res.json({
        runs,
        valid,
        impossible,
        invalid: runs - valid - impossible,
        problems: problems.slice(0, 20),
        pairCoverage: allowedPairs > 0 ? pairsSeen.size / allowedPairs : 0,
        ms: Math.round(performance.now() - started),
      });
    });
  }

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON" });
    if ((err as { type?: string }).type === "entity.too.large") {
      return res.status(413).json({ error: "That file is too large" });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}
