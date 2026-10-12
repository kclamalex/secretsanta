import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { adminTokens, api, participantTokens, revealedMatches, type AdminSession, type Me, type PublicSession } from "./api.ts";
import { Avatar } from "./Avatar.tsx";
import { squarePhoto } from "./photo.ts";
import { Reveal } from "./Reveal.tsx";
import { copyText, ShareButtons } from "./Share.tsx";
import { TestPage } from "./TestPage.tsx";

// ---- Tiny router: "/", "/s/:code", "/admin/:code" ----

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const path = usePath();
  const join = path.match(/^\/s\/([A-Za-z0-9]+)\/?$/);
  const admin = path.match(/^\/admin\/([A-Za-z0-9]+)\/?$/);
  const testPage = path.match(/^\/test(?:\/([A-Za-z0-9]+))?\/?$/); // hidden; only works with TEST_MODE=1

  return (
    <main>
      <header>
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="brand">
          🎁 Secret Santa
        </a>
      </header>
      {join ? (
        <JoinPage code={join[1].toUpperCase()} />
      ) : admin ? (
        <AdminPage code={admin[1].toUpperCase()} />
      ) : testPage ? (
        <TestPage code={testPage[1]?.toUpperCase() ?? null} navigate={navigate} />
      ) : (
        <HomePage />
      )}
    </main>
  );
}

// ---- Shared bits ----

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="error" role="alert">{error}</p> : null;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Re-runs `load` every few seconds so lists stay current without a refresh. */
function usePolling(load: () => Promise<void>, ms = 4000) {
  useEffect(() => {
    load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms]);
}

// ---- Home ----

function HomePage() {
  const [sessionName, setSessionName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id, adminToken } = await api.createSession(sessionName);
      adminTokens.set(id, adminToken);
      navigate(`/admin/${id}`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean) navigate(`/s/${clean}`);
  };

  return (
    <>
      <Card title="Join a session">
        <form onSubmit={join} className="row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Session code, e.g. K7PQ2M"
            aria-label="Session code"
            className="code-input"
            maxLength={6}
          />
          <button type="submit" disabled={!code.trim()}>Join</button>
        </form>
      </Card>
      <Card title="Start a new session">
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

// ---- Participant ----

/** Round photo button with a camera badge. On iPhone the picker offers camera, library or files. */
function PhotoPicker({ person, busy, onPick }: { person: { name: string; avatarUrl: string | null }; busy: boolean; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="photo-picker"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={person.avatarUrl ? "Change your photo" : "Add your photo"}
      >
        <Avatar person={person} size={88} />
        <span className="photo-badge" aria-hidden>{busy ? "…" : "📷"}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow picking the same file again
          if (file) onPick(file);
        }}
      />
    </>
  );
}

function JoinPage({ code }: { code: string }) {
  const [token, setToken] = useState(() => participantTokens.get(code));
  const [session, setSession] = useState<PublicSession | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A photo picked before joining is held here and uploaded right after the join.
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealedId, setRevealedId] = useState(() => revealedMatches.get(code));

  useEffect(() => {
    if (!pendingPhoto) return setPendingUrl(null);
    const url = URL.createObjectURL(pendingPhoto);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingPhoto]);

  const load = useCallback(async () => {
    try {
      setSession(await api.getSession(code));
      if (token) setMe(await api.me(code, token));
      setError(null);
    } catch (err) {
      const msg = message(err);
      // Token no longer valid (e.g. admin removed this person): let them rejoin.
      if (token && msg.startsWith("Not a participant")) {
        participantTokens.clear(code);
        setToken(null);
        setMe(null);
      } else {
        setError(msg);
      }
    }
  }, [code, token]);
  usePolling(load);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.join(code, name);
      participantTokens.set(code, token);
      if (pendingPhoto) {
        await api.uploadAvatar(code, token, pendingPhoto).catch((err) => setError(`Joined, but the photo failed: ${message(err)}`));
        setPendingPhoto(null);
      }
      setToken(token);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const photo = await squarePhoto(file);
      if (token) {
        await api.uploadAvatar(code, token, photo);
        await load();
      } else {
        setPendingPhoto(photo);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!token) return setPendingPhoto(null);
    try {
      await api.removeAvatar(code, token);
      await load();
    } catch (err) {
      setError(message(err));
    }
  };

  if (!session) return <Card><ErrorText error={error} />{!error && <p>Loading…</p>}</Card>;

  const giftee = me?.giftTo ?? null;
  const unopened = giftee && revealedId !== String(giftee.id);
  const joinLink = `${window.location.origin}/s/${session.id}`;
  const markRevealed = () => {
    if (!giftee) return;
    revealedMatches.set(code, String(giftee.id));
    setRevealedId(String(giftee.id));
  };

  return (
    <>
      <Card>
        <h1 className="session-title">{session.name}</h1>
        <p className="hint">Session code <strong className="code">{session.id}</strong></p>

        {!token && session.status === "open" && (
          <form onSubmit={join} className="join-form">
            <PhotoPicker person={{ name: name || "?", avatarUrl: pendingUrl }} busy={busy} onPick={pickPhoto} />
            <div className="join-fields">
              <p className="hint">Add a photo so your Secret Santa sees your face at the big reveal.</p>
              <div className="row">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={60} />
                <button type="submit" disabled={busy || !name.trim()}>Join</button>
              </div>
            </div>
          </form>
        )}
        {!token && session.status === "drawn" && <p>Names have already been drawn. Ask the admin to reset if you need to join.</p>}

        {me && (
          <div className="me">
            <PhotoPicker person={me} busy={busy} onPick={pickPhoto} />
            <div>
              <p className="me-name">{me.name}</p>
              <p className="hint">
                {me.avatarUrl ? "Tap your photo to change it." : "Tap the circle to add your photo."}
                {me.avatarUrl && <button className="link danger" onClick={removePhoto}>remove</button>}
              </p>
            </div>
          </div>
        )}
        {me && !giftee && <p className="waiting">⏳ Your match appears here once the admin draws names.</p>}
        <ErrorText error={error} />
      </Card>

      {giftee && unopened && (
        <button className="gift-card" onClick={() => setRevealing(true)}>
          <span className="gift-card-box" aria-hidden>🎁</span>
          <span>
            <strong>Names are drawn!</strong>
            <span className="hint">Tap to unwrap your match. Make sure nobody is looking 👀</span>
          </span>
        </button>
      )}
      {giftee && !unopened && (
        <Card>
          <div className="match">
            <Avatar person={giftee} size={96} />
            <div>
              <p className="hint">You're Secret Santa for</p>
              <p className="match-name">{giftee.name}</p>
              <button className="secondary" onClick={() => setRevealing(true)}>Replay the reveal</button>
            </div>
          </div>
        </Card>
      )}

      {session.status === "open" && (
        <Card title="Invite people">
          <ShareButtons title={session.name} text={`Join our Secret Santa "${session.name}" 🎁`} url={joinLink} />
        </Card>
      )}

      <Card title={`Who's in (${session.participants.length})`}>
        <ul className="faces">
          {session.participants.map((p) => (
            <li key={p.id}>
              <Avatar person={p} size={56} />
              <span>{p.name}{me?.participantId === p.id && " (you)"}</span>
            </li>
          ))}
        </ul>
      </Card>

      {revealing && giftee && (
        <Reveal
          giftee={giftee}
          pool={session.participants.filter((p) => p.id !== me?.participantId)}
          onRevealed={markRevealed}
          onClose={() => setRevealing(false)}
        />
      )}
    </>
  );
}

// ---- Admin ----

function AdminPage({ code }: { code: string }) {
  const [token] = useState(() => {
    // Admin links carry the token in the #fragment so it never hits server logs.
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      adminTokens.set(code, fromHash);
      window.history.replaceState(null, "", window.location.pathname);
    }
    return fromHash || adminTokens.get(code);
  });
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [giver, setGiver] = useState("");
  const [receiver, setReceiver] = useState("");
  const [both, setBoth] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setSession(await api.adminView(code, token));
    } catch (err) {
      setError(message(err));
    }
  }, [code, token]);
  usePolling(load);

  if (!token) {
    return <Card title="Admin access needed"><p>Open the admin link saved when this session was created.</p></Card>;
  }
  if (!session) return <Card><ErrorText error={error} />{!error && <p>Loading…</p>}</Card>;

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(message(err));
    }
  };

  const nameOf = (id: number) => session.participants.find((p) => p.id === id)?.name ?? "?";
  const locked = session.status === "drawn";
  const joinLink = `${window.location.origin}/s/${session.id}`;
  const adminLink = `${window.location.origin}/admin/${session.id}#${token}`;

  const copyAdminLink = async () => {
    if (await copyText(adminLink)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const addRule = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      await api.addExclusion(code, token, Number(giver), Number(receiver), both);
      setGiver("");
      setReceiver("");
    });
  };

  return (
    <>
      <Card title={`${session.name} · admin`}>
        <p className="code-big">{session.id}</p>
        <p className="hint">Send the link to everyone. They join from their own phone and add a photo.</p>
        <ShareButtons title={session.name} text={`Join our Secret Santa "${session.name}" 🎁`} url={joinLink} />
        <div className="row wrap admin-links">
          <button className="secondary" onClick={copyAdminLink}>{copied ? "Copied!" : "Copy admin link (private)"}</button>
          <button className="secondary" onClick={() => navigate(`/s/${session.id}`)}>Join as a participant</button>
        </div>
      </Card>

      <Card title={`Participants (${session.participants.length})`}>
        {session.participants.length === 0 && <p className="hint">Nobody has joined yet. This list updates on its own.</p>}
        <ul className="people">
          {session.participants.map((p) => (
            <li key={p.id}>
              <span className="person"><Avatar person={p} size={32} />{p.name}</span>
              {!locked && (
                <button className="link danger" onClick={() => confirm(`Remove ${p.name}?`) && act(() => api.removeParticipant(code, token, p.id))}>
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Rules: who can't get who">
        {!locked && session.participants.length >= 2 && (
          <form onSubmit={addRule} className="rule-form">
            <select value={giver} onChange={(e) => setGiver(e.target.value)} aria-label="Giver">
              <option value="">Giver…</option>
              {session.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span>can't get</span>
            <select value={receiver} onChange={(e) => setReceiver(e.target.value)} aria-label="Receiver">
              <option value="">Receiver…</option>
              {session.participants.filter((p) => String(p.id) !== giver).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label className="check">
              <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /> both ways
            </label>
            <button type="submit" disabled={!giver || !receiver}>Add rule</button>
          </form>
        )}
        {session.exclusions.length === 0 ? (
          <p className="hint">No rules yet. Anyone can get anyone (except themselves).</p>
        ) : (
          <ul className="people">
            {session.exclusions.map((x) => (
              <li key={x.id}>
                {nameOf(x.giverId)} ✗ {nameOf(x.receiverId)}
                {!locked && <button className="link danger" onClick={() => act(() => api.removeExclusion(code, token, x.id))}>remove</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Draw">
        {locked ? (
          <>
            <p>✅ Names are drawn. Each person sees their match at the join link.</p>
            <button className="secondary" onClick={() => confirm("Clear all matches and reopen the session?") && act(() => api.reset(code, token))}>
              Reset draw
            </button>
          </>
        ) : (
          <>
            <p className="hint">Joining and rule changes lock after the draw. Even you won't see who got who.</p>
            <button onClick={() => act(() => api.draw(code, token))} disabled={session.participants.length < 3}>
              Draw names
            </button>
          </>
        )}
        <ErrorText error={error} />
      </Card>
    </>
  );
}
