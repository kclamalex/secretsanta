import { sessionsApi } from "../../api/secretSanta.ts";
import { adminTokens } from "../../store/local.ts";

/** Creates a session and remembers this browser as its admin. */
export async function createSession(name: string) {
  const created = await sessionsApi.create(name);
  adminTokens.set(created.id, created.adminToken);
  return created;
}
