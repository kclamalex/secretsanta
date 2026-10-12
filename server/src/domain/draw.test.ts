import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDraw, draw } from "./draw.ts";

function assertValid(ids: number[], result: Map<number, number> | null, blocked: [number, number][] = []) {
  assert.ok(result, "expected a draw");
  assert.equal(result.size, ids.length);
  assert.deepEqual([...result.values()].sort(), [...ids].sort(), "everyone receives exactly once");
  for (const [giver, receiver] of result) {
    assert.notEqual(giver, receiver);
    assert.ok(!blocked.some(([g, r]) => g === giver && r === receiver), `${giver} must not get ${receiver}`);
  }
}

test("needs at least two people", () => {
  assert.equal(draw([], []), null);
  assert.equal(draw([1], []), null);
});

test("two people swap", () => {
  const result = draw([1, 2], []);
  assert.deepEqual([...result!.entries()].sort(), [[1, 2], [2, 1]]);
});

test("respects exclusions across many runs", () => {
  const ids = [1, 2, 3, 4, 5, 6];
  const blocked: [number, number][] = [[1, 2], [2, 1], [3, 4], [4, 3], [5, 1]];
  const exclusions = blocked.map(([giverId, receiverId]) => ({ giverId, receiverId }));
  for (let i = 0; i < 200; i++) assertValid(ids, draw(ids, exclusions), blocked);
});

test("finds the only valid draw when constraints are tight", () => {
  // 1 can only give to 2, 2 only to 3, 3 only to 1.
  const exclusions = [
    { giverId: 1, receiverId: 3 },
    { giverId: 2, receiverId: 1 },
    { giverId: 3, receiverId: 2 },
  ];
  for (let i = 0; i < 50; i++) {
    assert.deepEqual([...draw([1, 2, 3], exclusions)!.entries()].sort(), [[1, 2], [2, 3], [3, 1]]);
  }
});

test("returns null when impossible", () => {
  // Two people who may not give to each other.
  assert.equal(draw([1, 2], [{ giverId: 1, receiverId: 2 }]), null);
  // Nobody may give to 3.
  assert.equal(draw([1, 2, 3], [{ giverId: 1, receiverId: 3 }, { giverId: 2, receiverId: 3 }]), null);
});

test("checkDraw catches broken draws", () => {
  const ids = [1, 2, 3];
  const rules = [{ giverId: 1, receiverId: 2 }];
  assert.deepEqual(checkDraw(ids, rules, new Map([[1, 3], [2, 1], [3, 2]])), []);
  assert.ok(checkDraw(ids, rules, new Map([[1, 2], [2, 3], [3, 1]])).some((p) => p.includes("breaks a rule")));
  assert.ok(checkDraw(ids, [], new Map([[1, 1], [2, 3], [3, 2]])).some((p) => p.includes("themselves")));
  assert.ok(checkDraw(ids, [], new Map([[1, 2], [2, 1], [3, 1]])).some((p) => p.includes("receives 2")));
  assert.ok(checkDraw(ids, [], new Map([[1, 2], [2, 1]])).some((p) => p.includes("gives to nobody")));
});

test("large draws stay valid", () => {
  const ids = Array.from({ length: 500 }, (_, i) => i + 1);
  const rules = ids.flatMap((id) => [{ giverId: id, receiverId: (id % 500) + 1 }, { giverId: id, receiverId: ((id + 1) % 500) + 1 }]);
  for (let i = 0; i < 5; i++) assert.deepEqual(checkDraw(ids, rules, draw(ids, rules)!), []);
});
