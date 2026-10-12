import { useCallback, useState } from "react";
import { participantApi, sessionsApi } from "../../api/secretSanta.ts";
import { usePolledData } from "../../hooks/usePolledData.ts";
import { errorMessage } from "../../lib/errors.ts";
import { participantTokens } from "../../store/local.ts";

/** The session as this browser sees it: who's in, and (once joined) who "me" is. Polls to stay current. */
export function useParticipant(code: string) {
  const [token, setToken] = useState(() => participantTokens.get(code));

  const fetcher = useCallback(async () => {
    const session = await sessionsApi.get(code);
    if (!token) return { session, me: null };
    try {
      return { session, me: await participantApi(code, token).me() };
    } catch (err) {
      // Token no longer valid (e.g. admin removed this person): let them rejoin.
      if (!errorMessage(err).startsWith("Not a participant")) throw err;
      participantTokens.clear(code);
      setToken(null);
      return { session, me: null };
    }
  }, [code, token]);
  const { data, error, reload } = usePolledData(fetcher);

  const signIn = (newToken: string) => {
    participantTokens.set(code, newToken);
    setToken(newToken);
  };

  return {
    session: data?.session ?? null,
    me: token ? (data?.me ?? null) : null,
    api: token ? participantApi(code, token) : null,
    error,
    reload,
    signIn,
  };
}
