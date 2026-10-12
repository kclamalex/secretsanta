export type Participant = { id: number; name: string; avatarUrl: string | null };
export type Exclusion = { id: number; giverId: number; receiverId: number };
export type Status = "open" | "drawn";
export type PublicSession = { id: string; name: string; status: Status; participants: Participant[] };
export type AdminSession = PublicSession & { exclusions: Exclusion[] };
export type Me = { participantId: number; name: string; avatarUrl: string | null; status: Status; giftTo: Participant | null };

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isBlob = body instanceof Blob;
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": isBlob ? body.type : "application/json", ...headers },
    body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

const admin = (token: string) => ({ "x-admin-token": token });
const participant = (token: string) => ({ "x-participant-token": token });

export const api = {
  createSession: (name: string) => request<{ id: string; adminToken: string }>("POST", "/sessions", { name }),
  getSession: (id: string) => request<PublicSession>("GET", `/sessions/${id}`),
  join: (id: string, name: string) => request<{ token: string }>("POST", `/sessions/${id}/join`, { name }),
  me: (id: string, token: string) => request<Me>("GET", `/sessions/${id}/me`, undefined, participant(token)),
  uploadAvatar: (id: string, token: string, photo: Blob) =>
    request<{ avatarUrl: string }>("PUT", `/sessions/${id}/me/avatar`, photo, participant(token)),
  removeAvatar: (id: string, token: string) =>
    request<void>("DELETE", `/sessions/${id}/me/avatar`, undefined, participant(token)),
  adminView: (id: string, token: string) => request<AdminSession>("GET", `/sessions/${id}/admin`, undefined, admin(token)),
  removeParticipant: (id: string, token: string, pid: number) =>
    request<void>("DELETE", `/sessions/${id}/participants/${pid}`, undefined, admin(token)),
  addExclusion: (id: string, token: string, giverId: number, receiverId: number, both: boolean) =>
    request<unknown>("POST", `/sessions/${id}/exclusions`, { giverId, receiverId, both }, admin(token)),
  removeExclusion: (id: string, token: string, eid: number) =>
    request<void>("DELETE", `/sessions/${id}/exclusions/${eid}`, undefined, admin(token)),
  draw: (id: string, token: string) => request<unknown>("POST", `/sessions/${id}/draw`, undefined, admin(token)),
  reset: (id: string, token: string) => request<unknown>("POST", `/sessions/${id}/reset`, undefined, admin(token)),
};

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

export const testApi = {
  enabled: () => request<{ testMode: boolean }>("GET", "/test"),
  addPeople: (id: string, token: string, count: number) =>
    request<unknown>("POST", `/test/sessions/${id}/people`, { count }, admin(token)),
  addRules: (id: string, token: string, count: number) =>
    request<unknown>("POST", `/test/sessions/${id}/rules`, { count }, admin(token)),
  clearRules: (id: string, token: string) => request<void>("DELETE", `/test/sessions/${id}/rules`, undefined, admin(token)),
  draw: (id: string, token: string) => request<TestDraw>("GET", `/test/sessions/${id}/draw`, undefined, admin(token)),
  simulate: (id: string, token: string, runs: number) =>
    request<Simulation>("POST", `/test/sessions/${id}/simulate`, { runs }, admin(token)),
};

// Tokens live in localStorage so a browser stays "logged in" to its sessions.
function store(kind: "admin" | "participant" | "revealed") {
  const key = (id: string) => `secretsanta:${kind}:${id.toUpperCase()}`;
  return {
    get: (id: string) => {
      try { return localStorage.getItem(key(id)); } catch { return null; }
    },
    set: (id: string, token: string) => {
      try { localStorage.setItem(key(id), token); } catch { /* private mode */ }
    },
    clear: (id: string) => {
      try { localStorage.removeItem(key(id)); } catch { /* private mode */ }
    },
  };
}
export const adminTokens = store("admin");
export const participantTokens = store("participant");
/** Remembers which match a browser has already unwrapped, so the reveal plays once. */
export const revealedMatches = store("revealed");
