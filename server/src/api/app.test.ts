import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.ts";
import { openDb } from "../db/index.ts";

let server: Server;
let base: string;

before(async () => {
  server = createApp(openDb(":memory:")).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => server.close());

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test("full secret santa flow", async () => {
  const created = await call("POST", "/sessions", { name: "Office party" });
  assert.equal(created.status, 201);
  const { id, adminToken } = created.body;
  assert.match(id, /^[A-Z2-9]{6}$/);
  const admin = { "x-admin-token": adminToken };

  const tokens: Record<string, string> = {};
  for (const name of ["Ann", "Bob", "Cat", "Dan"]) {
    const joined = await call("POST", `/sessions/${id.toLowerCase()}/join`, { name });
    assert.equal(joined.status, 201);
    tokens[name] = joined.body.token;
  }
  assert.equal((await call("POST", `/sessions/${id}/join`, { name: "ann" })).status, 409, "duplicate name");

  const session = await call("GET", `/sessions/${id}`);
  assert.equal(session.body.participants.length, 4);
  const idOf = Object.fromEntries(session.body.participants.map((p: any) => [p.name, p.id]));

  // Admin routes need the token.
  assert.equal((await call("GET", `/sessions/${id}/admin`)).status, 403);
  assert.equal((await call("GET", `/sessions/${id}/admin`, undefined, { "x-admin-token": "nope" })).status, 403);

  // Ann and Bob are a couple; Cat can't get Ann.
  const rule = await call("POST", `/sessions/${id}/exclusions`, { giverId: idOf.Ann, receiverId: idOf.Bob, both: true }, admin);
  assert.equal(rule.body.exclusions.length, 2);
  await call("POST", `/sessions/${id}/exclusions`, { giverId: idOf.Cat, receiverId: idOf.Ann }, admin);

  // Before the draw nobody has a match.
  const before = await call("GET", `/sessions/${id}/me`, undefined, { "x-participant-token": tokens.Ann });
  assert.equal(before.body.giftTo, null);

  assert.equal((await call("POST", `/sessions/${id}/draw`, undefined, admin)).status, 200);
  assert.equal((await call("POST", `/sessions/${id}/join`, { name: "Eve" })).status, 409, "locked after draw");

  const matches: Record<string, string> = {};
  for (const [name, token] of Object.entries(tokens)) {
    const me = await call("GET", `/sessions/${id}/me`, undefined, { "x-participant-token": token });
    assert.equal(me.body.name, name);
    matches[name] = me.body.giftTo.name;
  }
  assert.deepEqual(Object.values(matches).sort(), ["Ann", "Bob", "Cat", "Dan"]);
  for (const [giver, receiver] of Object.entries(matches)) assert.notEqual(giver, receiver);
  assert.notEqual(matches.Ann, "Bob");
  assert.notEqual(matches.Bob, "Ann");
  assert.notEqual(matches.Cat, "Ann");

  // Reset reopens the session.
  await call("POST", `/sessions/${id}/reset`, undefined, admin);
  const after = await call("GET", `/sessions/${id}/me`, undefined, { "x-participant-token": tokens.Ann });
  assert.equal(after.body.giftTo, null);
  assert.equal(after.body.status, "open");
});

test("draw fails clearly when rules make it impossible", async () => {
  const { id, adminToken } = (await call("POST", "/sessions", { name: "Tiny" })).body;
  const admin = { "x-admin-token": adminToken };
  for (const name of ["A", "B", "C"]) await call("POST", `/sessions/${id}/join`, { name });
  const [a, b, c] = (await call("GET", `/sessions/${id}`)).body.participants.map((p: any) => p.id);
  await call("POST", `/sessions/${id}/exclusions`, { giverId: a, receiverId: c }, admin);
  await call("POST", `/sessions/${id}/exclusions`, { giverId: b, receiverId: c }, admin);
  const res = await call("POST", `/sessions/${id}/draw`, undefined, admin);
  assert.equal(res.status, 422);
  assert.match(res.body.error, /No valid draw/);
});

test("participants can upload, replace and remove a profile photo", async () => {
  const { id } = (await call("POST", "/sessions", { name: "Photos" })).body;
  const { token } = (await call("POST", `/sessions/${id}/join`, { name: "Ann" })).body;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const put = (body: Buffer, t = token) =>
    fetch(`${base}/sessions/${id}/me/avatar`, {
      method: "PUT",
      headers: { "content-type": "image/png", "x-participant-token": t },
      body: new Uint8Array(body),
    });

  assert.equal((await put(png, "nope")).status, 403);
  assert.equal((await put(Buffer.from("<svg onload=alert(1)>"))).status, 415, "only real images");
  assert.equal((await put(Buffer.alloc(2 * 1024 * 1024, 0xff))).status, 413);

  const uploaded = await put(png);
  assert.equal(uploaded.status, 200);
  const { avatarUrl } = (await uploaded.json()) as { avatarUrl: string };
  assert.equal((await call("GET", `/sessions/${id}`)).body.participants[0].avatarUrl, avatarUrl);

  const photo = await fetch(base.replace(/\/api$/, "") + avatarUrl);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);

  // A new upload gets a new URL so cached copies are never stale.
  const second = (await (await put(png)).json()) as { avatarUrl: string };
  assert.notEqual(second.avatarUrl, avatarUrl);

  await call("DELETE", `/sessions/${id}/me/avatar`, undefined, { "x-participant-token": token });
  assert.equal((await call("GET", `/sessions/${id}`)).body.participants[0].avatarUrl, null);
});

test("test routes are hidden unless test mode is on", async () => {
  assert.equal((await call("GET", "/test")).status, 404);
  const { id, adminToken } = (await call("POST", "/sessions", { name: "Hidden" })).body;
  const res = await call("POST", `/test/sessions/${id}/people`, { count: 5 }, { "x-admin-token": adminToken });
  assert.equal(res.status, 404);
});

test("test mode bulk-adds people and rules, then verifies draws", async () => {
  const testServer = createApp(openDb(":memory:"), { testMode: true }).listen(0);
  await new Promise((r) => testServer.once("listening", r));
  const testBase = `http://127.0.0.1:${(testServer.address() as AddressInfo).port}/api`;
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(testBase + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    // Anything that arrived through a proxy or tunnel counts as public.
    for (const header of ["x-forwarded-for", "cf-connecting-ip", "forwarded"]) {
      const res = await fetch(`${testBase}/test`, { headers: { [header]: "203.0.113.7" } });
      assert.equal(res.status, 404, `${header} hides test mode`);
    }
    assert.equal((await fetch(`${testBase}/test`)).status, 200, "direct local request is allowed");

    const { id, adminToken } = (await post("/sessions", { name: "Load test" })).body;
    const admin = { "x-admin-token": adminToken };
    assert.equal((await post(`/test/sessions/${id}/people`, { count: 5 })).status, 403, "still needs the admin token");

    assert.equal((await post(`/test/sessions/${id}/people`, { count: 200 }, admin)).body.participants.length, 200);
    assert.equal((await post(`/test/sessions/${id}/people`, { count: 10 }, admin)).body.participants.at(-1).name, "Test 210");
    assert.equal((await post(`/test/sessions/${id}/rules`, { count: 300 }, admin)).body.exclusions, 300);

    const sim = (await post(`/test/sessions/${id}/simulate`, { runs: 50 }, admin)).body;
    assert.equal(sim.valid, 50);
    assert.deepEqual(sim.problems, []);

    assert.equal((await post(`/sessions/${id}/draw`, {}, admin)).status, 200);
    const drawn = await (await fetch(`${testBase}/test/sessions/${id}/draw`, { headers: admin })).json();
    assert.deepEqual(drawn.problems, []);
    assert.equal(drawn.people.length, 210);
    assert.ok(drawn.people.every((p: { token: string; giftToId: number }) => p.token && p.giftToId));
  } finally {
    testServer.close();
  }
});

test("unknown session returns 404", async () => {
  assert.equal((await call("GET", "/sessions/ZZZZZZ")).status, 404);
});
