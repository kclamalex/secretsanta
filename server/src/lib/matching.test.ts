import { test } from "node:test";
import assert from "node:assert/strict";
import { randomMatching } from "./matching.ts";

test("matches any element types under any rule", () => {
  const people = ["ann", "bob", "cat"];
  const seats = [1, 2, 3, 4];
  const allowed = (p: string, s: number) => !(p === "ann" && s < 3);
  for (let i = 0; i < 50; i++) {
    const result = randomMatching(people, seats, allowed)!;
    assert.equal(result.size, 3);
    assert.equal(new Set(result.values()).size, 3, "each seat used once");
    assert.ok(result.get("ann")! >= 3);
  }
});

test("returns null when no matching exists", () => {
  assert.equal(randomMatching(["a", "b"], ["x"], () => true), null);
  assert.equal(randomMatching(["a"], ["x", "y"], () => false), null);
});

test("is deterministic for a given random source", () => {
  const seeded = () => {
    let s = 42;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  };
  const items = [1, 2, 3, 4, 5, 6];
  const run = () => [...randomMatching(items, items, (a, b) => a !== b, seeded())!];
  assert.deepEqual(run(), run());
});
