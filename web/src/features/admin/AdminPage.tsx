import { useCallback } from "react";
import { adminApi } from "../../api/secretSanta.ts";
import { Avatar } from "../../components/Avatar.tsx";
import { Card, LoadingCard } from "../../components/Card.tsx";
import { ErrorText } from "../../components/ErrorText.tsx";
import { CopyButton } from "../../components/ShareButton.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { usePolledData } from "../../hooks/usePolledData.ts";
import { navigate } from "../../lib/router.ts";
import { InviteButton } from "../shared/InviteButton.tsx";
import { absoluteUrl, paths } from "../shared/paths.ts";
import { RuleForm } from "./RuleForm.tsx";
import { useAdminToken } from "./useAdminToken.ts";

export function AdminPage({ code }: { code: string }) {
  const token = useAdminToken(code);
  return token ? (
    <AdminConsole code={code} token={token} />
  ) : (
    <Card title="Admin access needed"><p>Open the admin link saved when this session was created.</p></Card>
  );
}

function AdminConsole({ code, token }: { code: string; token: string }) {
  const api = adminApi(code, token);
  const { data: session, error: loadError, reload } = usePolledData(useCallback(() => adminApi(code, token).view(), [code, token]));
  const { error: actionError, run } = useAsyncAction();
  const error = actionError ?? loadError;

  if (!session) return <LoadingCard error={error} />;

  /** Runs an admin action, then refreshes. Resolves true on success. */
  const act = (fn: () => Promise<unknown>) =>
    run(async () => {
      await fn();
      await reload();
    });

  const nameOf = (id: number) => session.participants.find((p) => p.id === id)?.name ?? "?";
  const locked = session.status === "drawn";

  return (
    <>
      <div className="page-head">
        <p className="kicker">Admin</p>
        <h1 className="session-title">{session.name}</h1>
      </div>

      <Card title="Invite people">
        <p className="code-caption">Session code</p>
        <p className="code-big">{session.id}</p>
        <p className="hint">Send the link to everyone. They join from their own phone and add a photo.</p>
        <InviteButton session={session} />
        <div className="row wrap admin-links">
          <CopyButton text={absoluteUrl(`${paths.admin(session.id)}#${token}`)} label="Copy admin link (private)" />
          <button type="button" className="secondary" onClick={() => navigate(paths.join(session.id))}>Join as a participant</button>
        </div>
      </Card>

      <Card title={`Participants (${session.participants.length})`}>
        {session.participants.length === 0 && <p className="hint">Nobody has joined yet. This list updates on its own.</p>}
        <ul className="people">
          {session.participants.map((p) => (
            <li key={p.id}>
              <span className="person"><Avatar person={p} size={32} className="ring-1" />{p.name}</span>
              {!locked && (
                <button type="button" className="link danger" onClick={() => confirm(`Remove ${p.name}?`) && act(() => api.removeParticipant(p.id))}>
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Rules: who can't get who">
        {!locked && session.participants.length >= 2 && (
          <RuleForm participants={session.participants} onAdd={(g, r, both) => act(() => api.addExclusion(g, r, both))} />
        )}
        {session.exclusions.length === 0 ? (
          <p className="hint">No rules yet. Anyone can get anyone (except themselves).</p>
        ) : (
          <ul className="people">
            {session.exclusions.map((x) => (
              <li key={x.id}>
                {nameOf(x.giverId)} can't get {nameOf(x.receiverId)}
                {!locked && <button type="button" className="link danger" onClick={() => act(() => api.removeExclusion(x.id))}>remove</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Draw">
        {locked ? (
          <>
            <p>Names are drawn. Each person sees their match at the join link.</p>
            <button type="button" className="secondary" onClick={() => confirm("Clear all matches and reopen the session?") && act(api.reset)}>
              Reset draw
            </button>
          </>
        ) : (
          <>
            <p className="hint">Joining and rule changes lock after the draw. Even you won't see who got who.</p>
            <button type="button" className="big" onClick={() => act(api.draw)} disabled={session.participants.length < 3}>
              Draw names
            </button>
          </>
        )}
        <ErrorText error={error} />
      </Card>
    </>
  );
}
