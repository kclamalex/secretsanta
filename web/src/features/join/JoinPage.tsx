import { useState, type FormEvent } from "react";
import { sessionsApi, participantApi } from "../../api/secretSanta.ts";
import { Avatar } from "../../components/Avatar.tsx";
import { Card, LoadingCard } from "../../components/Card.tsx";
import { ErrorText } from "../../components/ErrorText.tsx";
import { SnowflakeIcon } from "../../components/icons.tsx";
import { PhotoPicker } from "../../components/PhotoPicker.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { useObjectUrl } from "../../hooks/useObjectUrl.ts";
import { errorMessage } from "../../lib/errors.ts";
import { squarePhoto } from "../../lib/photo.ts";
import { revealedMatches } from "../../store/local.ts";
import { Reveal } from "../reveal/Reveal.tsx";
import { InviteButton } from "../shared/InviteButton.tsx";
import { GiftTeaser } from "./GiftTeaser.tsx";
import { useParticipant } from "./useParticipant.ts";

export function JoinPage({ code }: { code: string }) {
  const { session, me, api, error: loadError, reload, signIn } = useParticipant(code);
  const { busy, error, setError, run } = useAsyncAction();
  const [name, setName] = useState("");
  // A photo picked before joining is held here and uploaded right after the join.
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null);
  const pendingUrl = useObjectUrl(pendingPhoto);
  const [revealing, setRevealing] = useState(false);
  const [revealedId, setRevealedId] = useState(() => revealedMatches.get(code));

  const join = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { token } = await sessionsApi.join(code, name);
      if (pendingPhoto) {
        await participantApi(code, token)
          .uploadAvatar(pendingPhoto)
          .catch((err) => setError(`Joined, but the photo failed: ${errorMessage(err)}`));
        setPendingPhoto(null);
      }
      signIn(token);
    });
  };

  const pickPhoto = (file: File) =>
    run(async () => {
      const photo = await squarePhoto(file);
      if (!api) return setPendingPhoto(photo);
      await api.uploadAvatar(photo);
      await reload();
    });

  const removePhoto = () => {
    if (!api) return setPendingPhoto(null);
    run(async () => {
      await api.removeAvatar();
      await reload();
    });
  };

  if (!session) return <LoadingCard error={loadError} />;

  const joined = api !== null;
  const shownError = error ?? loadError;
  const giftee = me?.giftTo ?? null;
  const unopened = giftee && revealedId !== String(giftee.id);
  const markRevealed = () => {
    if (!giftee) return;
    revealedMatches.set(code, String(giftee.id));
    setRevealedId(String(giftee.id));
  };

  return (
    <>
      <div className="page-head">
        <h1 className="session-title">{session.name}</h1>
        <p className="code-label">Code <strong className="code">{session.id}</strong></p>
      </div>

      {(!joined || me || shownError) && (
        <Card>
          {!joined && session.status === "open" && (
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
          {!joined && session.status === "drawn" && <p>Names have already been drawn. Ask the admin to reset if you need to join.</p>}

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
          <ErrorText error={shownError} />
        </Card>
      )}

      {giftee && unopened && <GiftTeaser opening={revealing} onOpen={() => setRevealing(true)} />}
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
          <InviteButton session={session} />
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
