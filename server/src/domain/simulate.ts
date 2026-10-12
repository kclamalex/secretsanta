import { checkDraw, draw, type Rule } from "./draw.ts";

/** Runs the draw many times in memory (nothing is saved) and checks every result. */
export function simulateDraws(participantIds: number[], rules: Rule[], runs: number) {
  const started = performance.now();
  let valid = 0;
  let impossible = 0;
  const problems: string[] = [];
  const pairsSeen = new Set<string>();
  for (let i = 0; i < runs; i++) {
    const result = draw(participantIds, rules);
    if (!result) {
      impossible++;
      continue;
    }
    const found = checkDraw(participantIds, rules, result);
    if (found.length) problems.push(...found.slice(0, 3));
    else valid++;
    for (const [g, r] of result) pairsSeen.add(`${g}:${r}`);
  }
  // How much of the allowed space the draws covered: a sign the shuffle isn't stuck.
  const allowedPairs = participantIds.length * (participantIds.length - 1) - rules.length;
  return {
    runs,
    valid,
    impossible,
    invalid: runs - valid - impossible,
    problems: problems.slice(0, 20),
    pairCoverage: allowedPairs > 0 ? pairsSeen.size / allowedPairs : 0,
    ms: Math.round(performance.now() - started),
  };
}
