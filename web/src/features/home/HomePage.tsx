import { useState, type CSSProperties, type FormEvent } from "react";
import { Card } from "../../components/Card.tsx";
import { ErrorText } from "../../components/ErrorText.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { navigate } from "../../lib/router.ts";
import { createSession } from "../shared/createSession.ts";
import { paths } from "../shared/paths.ts";

export function HomePage() {
  const [sessionName, setSessionName] = useState("");
  const [code, setCode] = useState("");
  const { busy, error, run } = useAsyncAction();

  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => navigate(paths.admin((await createSession(sessionName)).id)));
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean) navigate(paths.join(clean));
  };

  return (
    <>
      <div className="hero rise" style={{ "--i": 0 } as CSSProperties}>
        <h1 className="hero-title">Secret Santa</h1>
        <p className="hero-tagline">Draw names. Keep the secret.</p>
      </div>
      <Card title="Join a session" rise={1}>
        <form onSubmit={join} className="row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="K7PQ2M"
            aria-label="Session code"
            className="code-input"
            maxLength={6}
          />
          <button type="submit" disabled={!code.trim()}>Join</button>
        </form>
      </Card>
      <Card title="Start a new session" rise={2}>
        <form onSubmit={create} className="row">
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="Name, e.g. Family Christmas 2026"
            aria-label="Session name"
            maxLength={60}
          />
          <button type="submit" disabled={busy || !sessionName.trim()}>Create</button>
        </form>
        <p className="hint">You become the admin: you set the rules and run the draw.</p>
        <ErrorText error={error} />
      </Card>
    </>
  );
}
