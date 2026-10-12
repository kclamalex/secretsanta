import { localStore } from "../lib/storage.ts";

// Per-session values in localStorage, so a browser stays "logged in" to its sessions.
const perSession = (kind: string) => localStore(`secretsanta:${kind}`, (code) => code.toUpperCase());

export const adminTokens = perSession("admin");
export const participantTokens = perSession("participant");
/** Remembers which match a browser has already unwrapped, so the reveal plays once. */
export const revealedMatches = perSession("revealed");
