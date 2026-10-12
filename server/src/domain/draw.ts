import { randomMatching } from "../lib/matching.ts";
import type { Random } from "../lib/random.ts";

/** Giver may not get receiver. */
export type Rule = { giverId: number; receiverId: number };

const pairKey = (giver: number, receiver: number) => `${giver}:${receiver}`;
const blockedPairs = (rules: Rule[]) => new Set(rules.map((r) => pairKey(r.giverId, r.receiverId)));

/**
 * Assigns each participant a receiver so that nobody gets themselves and no rule is broken.
 * Returns null when the rules make a draw impossible.
 */
export function draw(participantIds: number[], rules: Rule[], random: Random = Math.random): Map<number, number> | null {
  if (participantIds.length < 2) return null;
  const blocked = blockedPairs(rules);
  return randomMatching(
    participantIds,
    participantIds,
    (giver, receiver) => giver !== receiver && !blocked.has(pairKey(giver, receiver)),
    random,
  );
}

/** Lists every way a draw breaks the rules. An empty list means the draw is valid. */
export function checkDraw(participantIds: number[], rules: Rule[], result: Map<number, number>): string[] {
  const problems: string[] = [];
  const blocked = blockedPairs(rules);
  const received = new Map<number, number>();
  for (const giver of participantIds) {
    const receiver = result.get(giver);
    if (receiver === undefined) {
      problems.push(`${giver} gives to nobody`);
      continue;
    }
    if (receiver === giver) problems.push(`${giver} gives to themselves`);
    if (blocked.has(pairKey(giver, receiver))) problems.push(`${giver} → ${receiver} breaks a rule`);
    received.set(receiver, (received.get(receiver) ?? 0) + 1);
  }
  for (const id of participantIds) {
    const count = received.get(id) ?? 0;
    if (count !== 1) problems.push(`${id} receives ${count} gifts`);
  }
  if (result.size !== participantIds.length) problems.push(`${result.size} givers for ${participantIds.length} people`);
  return problems;
}
