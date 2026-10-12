/** Returns a number in [0, 1), like Math.random. Injected so tests can be deterministic. */
export type Random = () => number;

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], random: Random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One random element. */
export const pick = <T>(items: readonly T[], random: Random = Math.random): T => items[Math.floor(random() * items.length)];
