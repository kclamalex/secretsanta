import { request, scopedRequest } from "./client.ts";
import type { AdminSession, Me, PublicSession, Simulation, TestDraw } from "./types.ts";

/** Calls anyone can make with a session code. */
export const sessionsApi = {
  create: (name: string) => request<{ id: string; adminToken: string }>("POST", "/sessions", { name }),
  get: (code: string) => request<PublicSession>("GET", `/sessions/${code}`),
  join: (code: string, name: string) => request<{ token: string }>("POST", `/sessions/${code}/join`, { name }),
};

/** Calls as a joined participant. */
export function participantApi(code: string, token: string) {
  const call = scopedRequest(`/sessions/${code}/me`, { "x-participant-token": token });
  return {
    me: () => call<Me>("GET"),
    uploadAvatar: (photo: Blob) => call<{ avatarUrl: string }>("PUT", "/avatar", photo),
    removeAvatar: () => call<void>("DELETE", "/avatar"),
  };
}

/** Calls as the session's admin. */
export function adminApi(code: string, token: string) {
  const call = scopedRequest(`/sessions/${code}`, { "x-admin-token": token });
  return {
    view: () => call<AdminSession>("GET", "/admin"),
    removeParticipant: (pid: number) => call<void>("DELETE", `/participants/${pid}`),
    addExclusion: (giverId: number, receiverId: number, both: boolean) =>
      call<unknown>("POST", "/exclusions", { giverId, receiverId, both }),
    removeExclusion: (eid: number) => call<void>("DELETE", `/exclusions/${eid}`),
    draw: () => call<unknown>("POST", "/draw"),
    reset: () => call<unknown>("POST", "/reset"),
  };
}

/** Test-mode calls. Only answered when the server runs with TEST_MODE=1. */
export const testModeApi = {
  enabled: () => request<{ testMode: boolean }>("GET", "/test"),
  session: (code: string, adminToken: string) => {
    const call = scopedRequest(`/test/sessions/${code}`, { "x-admin-token": adminToken });
    return {
      addPeople: (count: number) => call<unknown>("POST", "/people", { count }),
      addRules: (count: number) => call<unknown>("POST", "/rules", { count }),
      clearRules: () => call<void>("DELETE", "/rules"),
      draw: () => call<TestDraw>("GET", "/draw"),
      simulate: (runs: number) => call<Simulation>("POST", "/simulate", { runs }),
    };
  },
};
