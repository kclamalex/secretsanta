import { shuffle, type Random } from "./random.ts";

/**
 * Draws a random partner from `to` for every element of `from`, each partner used at most once,
 * so that `allowed(a, b)` holds for every pair.
 *
 * Uses bipartite matching (Kuhn's algorithm) over shuffled candidate lists, so the result is
 * random, a matching is always found when one exists, and null means none exists.
 */
export function randomMatching<A, B>(
  from: readonly A[],
  to: readonly B[],
  allowed: (a: A, b: B) => boolean,
  random: Random = Math.random,
): Map<A, B> | null {
  const candidates = new Map(from.map((a) => [a, shuffle(to.filter((b) => allowed(a, b)), random)]));
  const owner = new Map<B, A>();

  const place = (a: A, visited: Set<B>): boolean => {
    for (const b of candidates.get(a)!) {
      if (visited.has(b)) continue;
      visited.add(b);
      const current = owner.get(b);
      if (current === undefined || place(current, visited)) {
        owner.set(b, a);
        return true;
      }
    }
    return false;
  };

  for (const a of shuffle(from, random)) {
    if (!place(a, new Set())) return null;
  }
  return new Map([...owner].map(([b, a]) => [a, b]));
}
