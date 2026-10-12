/** Shapes returned by the server's /api routes. */

export type Person = { name: string; avatarUrl: string | null };
export type Participant = Person & { id: number };
export type Exclusion = { id: number; giverId: number; receiverId: number };
export type Status = "open" | "drawn";
export type PublicSession = { id: string; name: string; status: Status; participants: Participant[] };
export type AdminSession = PublicSession & { exclusions: Exclusion[] };
export type Me = Person & { participantId: number; status: Status; giftTo: Participant | null };

// Only answered when the server runs with TEST_MODE=1.
export type TestPerson = Participant & { token: string; giftToId: number | null };
export type TestDraw = { people: TestPerson[]; rules: number; problems: string[] };
export type Simulation = {
  runs: number;
  valid: number;
  impossible: number;
  invalid: number;
  problems: string[];
  pairCoverage: number;
  ms: number;
};
