export type Exclusion = { giverId: number; receiverId: number };

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Assigns each participant a receiver so that nobody gets themselves and no
 * exclusion rule is broken. Uses bipartite matching (Kuhn's algorithm) over
 * shuffled candidate lists, so it always finds a valid draw when one exists
 * and returns null when the rules make a draw impossible.
 */
export function draw(
  participantIds: number[],
  exclusions: Exclusion[],
  random: () => number = Math.random,
): Map<number, number> | null {
  if (participantIds.length < 2) return null;

  const blocked = new Set(exclusions.map((e) => `${e.giverId}:${e.receiverId}`));
  const candidates = new Map<number, number[]>();
  for (const giver of participantIds) {
    const options = participantIds.filter(
      (receiver) => receiver !== giver && !blocked.has(`${giver}:${receiver}`),
    );
    candidates.set(giver, shuffle(options, random));
  }

  const giverOf = new Map<number, number>();

  const tryAssign = (giver: number, visited: Set<number>): boolean => {
    for (const receiver of candidates.get(giver)!) {
      if (visited.has(receiver)) continue;
      visited.add(receiver);
      const current = giverOf.get(receiver);
      if (current === undefined || tryAssign(current, visited)) {
        giverOf.set(receiver, giver);
        return true;
      }
    }
    return false;
  };

  for (const giver of shuffle(participantIds, random)) {
    if (!tryAssign(giver, new Set())) return null;
  }

  const result = new Map<number, number>();
  for (const [receiver, giver] of giverOf) result.set(giver, receiver);
  return result;
}

/** Lists every way a draw breaks the rules. An empty list means the draw is valid. */
export function checkDraw(participantIds: number[], exclusions: Exclusion[], result: Map<number, number>): string[] {
  const problems: string[] = [];
  const blocked = new Set(exclusions.map((e) => `${e.giverId}:${e.receiverId}`));
  const received = new Map<number, number>();
  for (const giver of participantIds) {
    const receiver = result.get(giver);
    if (receiver === undefined) problems.push(`${giver} gives to nobody`);
    else {
      if (receiver === giver) problems.push(`${giver} gives to themselves`);
      if (blocked.has(`${giver}:${receiver}`)) problems.push(`${giver} → ${receiver} breaks a rule`);
      received.set(receiver, (received.get(receiver) ?? 0) + 1);
    }
  }
  for (const id of participantIds) {
    const count = received.get(id) ?? 0;
    if (count !== 1) problems.push(`${id} receives ${count} gifts`);
  }
  if (result.size !== participantIds.length) problems.push(`${result.size} givers for ${participantIds.length} people`);
  return problems;
}
