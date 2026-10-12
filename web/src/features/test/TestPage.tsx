import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, sessionsApi, testModeApi } from "../../api/secretSanta.ts";
import type { Simulation } from "../../api/types.ts";
import { Avatar } from "../../components/Avatar.tsx";
import { Card, LoadingCard } from "../../components/Card.tsx";
import { ErrorText } from "../../components/ErrorText.tsx";
import { Link } from "../../components/Link.tsx";
import { NumberInput } from "../../components/NumberInput.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { usePolledData } from "../../hooks/usePolledData.ts";
import { navigate } from "../../lib/router.ts";
import { adminTokens, participantTokens, revealedMatches } from "../../store/local.ts";
import { createSession } from "../shared/createSession.ts";
import { paths } from "../shared/paths.ts";

/** Hidden page for TEST_MODE=1: bulk fake people, random rules, and checks on the draw logic. */
export function TestPage({ code }: { code: string | null }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    testModeApi.enabled().then(() => setEnabled(true), () => setEnabled(false));
  }, []);

  if (enabled === null) return <LoadingCard />;
  if (!enabled) {
    return (
      <Card title="Test mode is off">
        <p className="hint">Start the server with <code>TEST_MODE=1</code>, e.g. <code>make test-mode</code>.</p>
      </Card>
    );
  }
  if (!code) return <NewTestSession />;
  const token = adminTokens.get(code);
  if (!token) {
    return <Card><p>No admin token for {code} in this browser. Create a session from <Link href={paths.test()}>/test</Link>.</p></Card>;
  }
  return <TestSession code={code} token={token} />;
}

function NewTestSession() {
  const [people, setPeople] = useState(30);
  const [rules, setRules] = useState(20);
  const { busy, error, run } = useAsyncAction();

  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { id, adminToken } = await createSession(`Test party (${people} people)`);
      const test = testModeApi.session(id, adminToken);
      await test.addPeople(people);
      if (rules > 0) await test.addRules(rules);
      navigate(paths.test(id));
    });
  };

  return (
    <Card title="New test session">
      <form onSubmit={create} className="test-form">
        <label>Fake people <NumberInput min={3} max={500} value={people} onChange={setPeople} /></label>
        <label>Random rules <NumberInput min={0} max={5000} value={rules} onChange={setRules} /></label>
        <button type="submit" disabled={busy || people < 3}>{busy ? "Creating…" : "Create"}</button>
      </form>
      <ErrorText error={error} />
    </Card>
  );
}

function TestSession({ code, token }: { code: string; token: string }) {
  const test = testModeApi.session(code, token);
  const admin = adminApi(code, token);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [addCount, setAddCount] = useState(10);
  const [ruleCount, setRuleCount] = useState(10);
  const [runs, setRuns] = useState(1000);
  const { busy, error: actionError, run } = useAsyncAction();

  const fetcher = useCallback(async () => {
    const [draw, session] = await Promise.all([testModeApi.session(code, token).draw(), sessionsApi.get(code)]);
    return { ...draw, open: session.status === "open" };
  }, [code, token]);
  const { data, error: loadError, reload } = usePolledData(fetcher, null);
  const error = actionError ?? loadError;

  if (!data) return <LoadingCard error={error} />;

  const act = (fn: () => Promise<unknown>) =>
    run(async () => {
      await fn();
      await reload();
    });

  const byId = new Map(data.people.map((p) => [p.id, p]));
  const { open } = data;

  const viewAs = (personToken: string) => {
    participantTokens.set(code, personToken);
    revealedMatches.clear(code); // replay the full reveal
    navigate(paths.join(code));
  };

  return (
    <>
      <Card title={`Test session ${code}`}>
        <p className="hint">
          {data.people.length} people · {data.rules} rules · {open ? "open" : "drawn"} ·{" "}
          <Link href={paths.admin(code)}>admin page</Link> · <Link href={paths.join(code)}>join page</Link>
        </p>

        {open && (
          <div className="test-form">
            <div className="inline">
              <NumberInput min={1} max={500} value={addCount} onChange={setAddCount} />
              <button type="button" disabled={busy} onClick={() => act(() => test.addPeople(addCount))}>Add people</button>
            </div>
            <div className="inline">
              <NumberInput min={1} max={5000} value={ruleCount} onChange={setRuleCount} />
              <button type="button" disabled={busy} onClick={() => act(() => test.addRules(ruleCount))}>Add random rules</button>
            </div>
            <button type="button" className="secondary" disabled={busy || data.rules === 0} onClick={() => act(test.clearRules)}>
              Clear rules
            </button>
          </div>
        )}

        <div className="test-form">
          <div className="inline">
            <NumberInput min={1} max={10000} value={runs} onChange={setRuns} />
            <button type="button" className="secondary" disabled={busy} onClick={() => act(async () => setSim(await test.simulate(runs)))}>
              Simulate draws
            </button>
          </div>
          {open ? (
            <button type="button" disabled={busy || data.people.length < 3} onClick={() => act(admin.draw)}>Draw for real</button>
          ) : (
            <button type="button" className="secondary" disabled={busy} onClick={() => act(admin.reset)}>Reset draw</button>
          )}
        </div>

        {sim && (
          <p className={sim.invalid ? "error" : ""}>
            {sim.invalid ? "Failed:" : "Passed:"} {sim.valid}/{sim.runs} valid · {sim.impossible} impossible · {sim.invalid} invalid ·{" "}
            {Math.round(sim.pairCoverage * 100)}% of allowed pairs seen · {sim.ms} ms
            {sim.problems.map((p) => <span key={p} className="error"><br />{p}</span>)}
          </p>
        )}
        <ErrorText error={error} />
      </Card>

      {!open && (
        <Card title="Saved draw">
          {data.problems.length === 0 ? (
            <p>All checks pass: everyone gives once, receives once, nobody gets themselves, no rule is broken.</p>
          ) : (
            <ul className="error">{data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          <p className="hint">“View as” logs this browser in as that person and replays their reveal.</p>
          <ul className="people">
            {data.people.map((p) => {
              const to = p.giftToId ? byId.get(p.giftToId) : undefined;
              return (
                <li key={p.id}>
                  <span className="person">
                    <Avatar person={p} size={28} />
                    {p.name} → {to ? to.name : "—"}
                  </span>
                  <button type="button" className="link" onClick={() => viewAs(p.token)}>view as</button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
