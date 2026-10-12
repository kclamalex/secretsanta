import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AmbientSnow } from "./AmbientSnow.tsx";
import { adminTokens, api, participantTokens, revealedMatches, type AdminSession, type Me, type PublicSession } from "./api.ts";
import { Avatar } from "./Avatar.tsx";
import { squarePhoto } from "./photo.ts";
import { EnvelopeBody, Reveal } from "./Reveal.tsx";
import { CameraIcon, SnowflakeIcon } from "./icons.tsx";
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
    <>
      <AmbientSnow />
      <main>
        <header className="site-header">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="brand">
            <span className="brand-seal" aria-hidden />
            Secret Santa
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
    </>
  );
}

// ---- Shared bits ----

/** A sheet of stationery. `rise` staggers it in on first mount (the nth card waits n × 60ms). */
function Card({ title, rise, className = "", children }: { title?: string; rise?: number; className?: string; children: ReactNode }) {
  const style = rise === undefined ? undefined : ({ "--i": rise } as CSSProperties);
  return (
    <section className={`card ${rise === undefined ? "" : "rise"} ${className}`} style={style}>
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
        <span className="photo-badge" aria-hidden>{busy ? "…" : <CameraIcon size={15} />}</span>
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
  const teaser = useRef<HTMLSpanElement>(null);

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

  // Where supported, the small envelope grows into the reveal's envelope.
  const openLetter = () => {
    const small = teaser.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!small || reduced || typeof document.startViewTransition !== "function") return setRevealing(true);
    const big = () => document.querySelector<HTMLElement>(".reveal-overlay .env");
    small.style.viewTransitionName = "letter";
    const transition = document.startViewTransition(() => {
      flushSync(() => setRevealing(true));
      small.style.viewTransitionName = "";
      const el = big();
      if (el) el.style.viewTransitionName = "letter";
    });
    transition.finished.finally(() => {
      const el = big();
      if (el) el.style.viewTransitionName = "";
    });
  };

  return (
    <>
      <div className="page-head">
        <h1 className="session-title">{session.name}</h1>
        <p className="code-label">Code <strong className="code">{session.id}</strong></p>
      </div>

      {(!token || me || error) && (
        <Card>

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
          {me && !giftee && (
            <p className="waiting">
              <SnowflakeIcon size={16} className="waiting-icon" />
              Your match appears here once the admin draws names.
            </p>
          )}
          <ErrorText error={error} />
        </Card>
      )}

      {giftee && unopened && (
        <button className={`gift-card ${revealing ? "is-open" : ""}`} onClick={openLetter}>
          <span ref={teaser} className="mini-env">
            <span className="env">
              <EnvelopeBody />
              <span className="seal">
                <span className="wax whole"><SnowflakeIcon /></span>
              </span>
            </span>
          </span>
          <span className="gift-card-text">
            <strong>A letter for you</strong>
            <span className="hint">Names are drawn. Open it somewhere private.</span>
          </span>
        </button>
      )}
      {giftee && !unopened && (
        <Card className="match">
          <p className="kicker">You're Secret Santa for</p>
          <Avatar person={giftee} size={88} className="ring" />
          <p className="match-name">{giftee.name}</p>
          <button className="secondary" onClick={() => setRevealing(true)}>Replay the reveal</button>
        </Card>
      )}

      {session.status === "open" && (
        <Card title="Invite people">
          <ShareButtons title={session.name} text={`Join our Secret Santa "${session.name}"`} url={joinLink} />
        </Card>
      )}

      <Card title={`Who's in (${session.participants.length})`}>
        <ul className="faces">
          {session.participants.map((p) => (
            <li key={p.id}>
              <Avatar person={p} size={56} className="ring" />
              <span className="face-name">{p.name}{me?.participantId === p.id && " (you)"}</span>
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
      <div className="page-head">
        <p className="kicker">Admin</p>
        <h1 className="session-title">{session.name}</h1>
      </div>

      <Card title="Invite people">
        <p className="code-caption">Session code</p>
        <p className="code-big">{session.id}</p>
        <p className="hint">Send the link to everyone. They join from their own phone and add a photo.</p>
        <ShareButtons title={session.name} text={`Join our Secret Santa "${session.name}"`} url={joinLink} />
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
              <span className="person"><Avatar person={p} size={32} className="ring-1" />{p.name}</span>
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
            <span className="rule-word">can't get</span>
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
                {nameOf(x.giverId)} can't get {nameOf(x.receiverId)}
                {!locked && <button className="link danger" onClick={() => act(() => api.removeExclusion(code, token, x.id))}>remove</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Draw">
        {locked ? (
          <>
            <p>Names are drawn. Each person sees their match at the join link.</p>
            <button className="secondary" onClick={() => confirm("Clear all matches and reopen the session?") && act(() => api.reset(code, token))}>
              Reset draw
            </button>
          </>
        ) : (
          <>
            <p className="hint">Joining and rule changes lock after the draw. Even you won't see who got who.</p>
            <button className="big" onClick={() => act(() => api.draw(code, token))} disabled={session.participants.length < 3}>
              Draw names
            </button>
          </>
        )}
        <ErrorText error={error} />
      </Card>
    </>
  );
}
