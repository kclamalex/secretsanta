import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminTokens, api, participantTokens, revealedMatches, testApi, type Simulation, type TestDraw } from "./api.ts";
import { Avatar } from "./Avatar.tsx";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Hidden page for TEST_MODE=1: bulk fake people, random rules, and checks on the draw logic. */
export function TestPage({ code, navigate }: { code: string | null; navigate: (to: string) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    testApi.enabled().then(() => setEnabled(true), () => setEnabled(false));
  }, []);

  if (enabled === null) return <section className="card"><p>Loading…</p></section>;
  if (!enabled) {
    return (
      <section className="card">
        <h2>Test mode is off</h2>
        <p className="hint">Start the server with <code>TEST_MODE=1</code>, e.g. <code>make test-mode</code>.</p>
      </section>
    );
  }
  return code ? <TestSession code={code} navigate={navigate} /> : <NewTestSession navigate={navigate} />;
}

function NewTestSession({ navigate }: { navigate: (to: string) => void }) {
  const [people, setPeople] = useState(30);
  const [rules, setRules] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id, adminToken } = await api.createSession(`Test party (${people} people)`);
      adminTokens.set(id, adminToken);
      await testApi.addPeople(id, adminToken, people);
      if (rules > 0) await testApi.addRules(id, adminToken, rules);
      navigate(`/test/${id}`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>New test session</h2>
      <form onSubmit={create} className="test-form">
        <label>Fake people <input type="number" min={3} max={500} value={people} onChange={(e) => setPeople(Number(e.target.value))} /></label>
        <label>Random rules <input type="number" min={0} max={5000} value={rules} onChange={(e) => setRules(Number(e.target.value))} /></label>
        <button type="submit" disabled={busy || people < 3}>{busy ? "Creating…" : "Create"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function TestSession({ code, navigate }: { code: string; navigate: (to: string) => void }) {
  const token = adminTokens.get(code);
  const [data, setData] = useState<TestDraw | null>(null);
  const [status, setStatus] = useState<"open" | "drawn">("open");
  const [sim, setSim] = useState<Simulation | null>(null);
  const [addCount, setAddCount] = useState(10);
  const [ruleCount, setRuleCount] = useState(10);
  const [runs, setRuns] = useState(1000);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [draw, session] = await Promise.all([testApi.draw(code, token), api.getSession(code)]);
    setData(draw);
    setStatus(session.status);
  }, [code, token]);

  useEffect(() => {
    load().catch((err) => setError(message(err)));
  }, [load]);

  if (!token) return <section className="card"><p>No admin token for {code} in this browser. Create a session from <a href="/test">/test</a>.</p></section>;
  if (!data) return <section className="card">{error ? <p className="error">{error}</p> : <p>Loading…</p>}</section>;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = new Map(data.people.map((p) => [p.id, p]));
  const open = status === "open";

  const viewAs = (personToken: string) => {
    participantTokens.set(code, personToken);
    revealedMatches.clear(code); // replay the full reveal
    navigate(`/s/${code}`);
  };

  return (
    <>
      <section className="card">
        <h2>Test session {code}</h2>
        <p className="hint">
          {data.people.length} people · {data.rules} rules · {open ? "open" : "drawn"} ·{" "}
          <a href={`/admin/${code}`}>admin page</a> · <a href={`/s/${code}`}>join page</a>
        </p>

        {open && (
          <div className="test-form">
            <div className="inline">
              <input type="number" min={1} max={500} value={addCount} onChange={(e) => setAddCount(Number(e.target.value))} />
              <button disabled={busy} onClick={() => act(() => testApi.addPeople(code, token, addCount))}>Add people</button>
            </div>
            <div className="inline">
              <input type="number" min={1} max={5000} value={ruleCount} onChange={(e) => setRuleCount(Number(e.target.value))} />
              <button disabled={busy} onClick={() => act(() => testApi.addRules(code, token, ruleCount))}>Add random rules</button>
            </div>
            <button className="secondary" disabled={busy || data.rules === 0} onClick={() => act(() => testApi.clearRules(code, token))}>
              Clear rules
            </button>
          </div>
        )}

        <div className="test-form">
          <div className="inline">
            <input type="number" min={1} max={10000} value={runs} onChange={(e) => setRuns(Number(e.target.value))} />
            <button className="secondary" disabled={busy} onClick={() => act(async () => setSim(await testApi.simulate(code, token, runs)))}>
              Simulate draws
            </button>
          </div>
          {open ? (
            <button disabled={busy || data.people.length < 3} onClick={() => act(() => api.draw(code, token))}>Draw for real</button>
          ) : (
            <button className="secondary" disabled={busy} onClick={() => act(() => api.reset(code, token))}>Reset draw</button>
          )}
        </div>

        {sim && (
          <p className={sim.invalid ? "error" : ""}>
            {sim.invalid ? "Failed:" : "Passed:"} {sim.valid}/{sim.runs} valid · {sim.impossible} impossible · {sim.invalid} invalid ·{" "}
            {Math.round(sim.pairCoverage * 100)}% of allowed pairs seen · {sim.ms} ms
            {sim.problems.map((p) => <span key={p} className="error"><br />{p}</span>)}
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {!open && (
        <section className="card">
          <h2>Saved draw</h2>
          {data.problems.length === 0 ? (
            <p>All checks pass: everyone gives once, receives once, nobody gets themselves, no rule is broken.</p>
          ) : (
            <ul className="error">{data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          <p className="hint">“View as” logs this browser in as that person and replays their reveal.</p>
          <ul className="people">
            {data.people.map((p) => {
              const to = p.giftToId ? nameOf.get(p.giftToId) : undefined;
              return (
                <li key={p.id}>
                  <span className="person">
                    <Avatar person={p} size={28} />
                    {p.name} → {to ? to.name : "—"}
                  </span>
                  <button className="link" onClick={() => viewAs(p.token)}>view as</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
