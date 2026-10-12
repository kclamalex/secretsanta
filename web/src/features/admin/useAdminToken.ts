import { useState } from "react";
import { adminTokens } from "../../store/local.ts";

/**
 * The admin token for this session. Admin links carry it in the #fragment so it never hits
 * server logs; it's saved to this browser and stripped from the address bar.
 */
export function useAdminToken(code: string) {
  const [token] = useState(() => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      adminTokens.set(code, fromHash);
      window.history.replaceState(null, "", window.location.pathname);
    }
    return fromHash || adminTokens.get(code);
  });
  return token;
}
