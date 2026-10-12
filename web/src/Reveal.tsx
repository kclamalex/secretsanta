import { useEffect, useRef, useState } from "react";
import type { Participant } from "./api.ts";
import { Avatar } from "./Avatar.tsx";
import { confetti } from "./confetti.ts";

type Phase = "wrapped" | "shaking" | "spinning" | "revealed";

const SPIN_FRAMES = 18;
const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern); // Android only; iOS ignores it

/**
 * Full-screen reveal: a wrapped gift to tap, a shake, a slot-machine spin through everyone's faces
 * that slows down, then the match lands with light rays and confetti.
 */
export function Reveal({
  giftee,
  pool,
  onRevealed,
  onClose,
}: {
  giftee: Participant;
  /** Everyone the spin can flash past (the viewer excluded). */
  pool: Participant[];
  onRevealed: () => void;
  onClose: () => void;
}) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState<Phase>("wrapped");
  const [frame, setFrame] = useState({ person: giftee, n: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Warm the cache so faces don't pop in mid-spin.
    for (const p of pool) if (p.avatarUrl) new Image().src = p.avatarUrl;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [pool]);

  useEffect(() => {
    if (phase === "shaking") {
      vibrate(300);
      const t = setTimeout(() => setPhase("spinning"), 1000);
      return () => clearTimeout(t);
    }

    if (phase === "spinning") {
      const decoys = pool.filter((p) => p.id !== giftee.id);
      const frames: Participant[] = [];
      for (let i = 0; i < SPIN_FRAMES; i++) {
        const options = decoys.filter((p) => p !== frames.at(-1));
        frames.push(options[Math.floor(Math.random() * options.length)] ?? giftee);
      }
      frames.push(giftee);

      let i = 0;
      let timer = 0;
      const step = () => {
        setFrame({ person: frames[i], n: i });
        vibrate(10);
        if (i === frames.length - 1) {
          timer = window.setTimeout(() => setPhase("revealed"), 450);
          return;
        }
        timer = window.setTimeout(step, 55 * 1.14 ** i); // ease out: each face lingers longer
        i++;
      };
      step();
      return () => clearTimeout(timer);
    }

    if (phase === "revealed") {
      onRevealed();
      vibrate([60, 40, 60, 40, 200]);
      if (!reducedMotion && canvas.current) return confetti(canvas.current);
    }
  }, [phase]);

  const open = () => setPhase(reducedMotion ? "revealed" : "shaking");

  return (
    <div className={`reveal-overlay phase-${phase}`} role="dialog" aria-modal="true" aria-label="Your Secret Santa match">
      {phase === "revealed" && <div className="rays" aria-hidden />}
      <canvas ref={canvas} className="confetti" aria-hidden />

      <div className="reveal-stage">
        {(phase === "wrapped" || phase === "shaking") && (
          <button className="gift" onClick={open} disabled={phase === "shaking"} aria-label="Open your gift">
            <span className="gift-box" aria-hidden>🎁</span>
            <span className="gift-label">{phase === "wrapped" ? "Tap to open" : "Here we go…"}</span>
          </button>
        )}

        {phase === "spinning" && (
          <div className="spin" aria-live="off">
            <p className="kicker">You're Secret Santa for…</p>
            <Avatar key={frame.n} person={frame.person} size={200} className="spin-face" />
            <p className="spin-name">{frame.person.name}</p>
          </div>
        )}

        {phase === "revealed" && (
          <div className="revealed" aria-live="polite">
            <p className="kicker">You're Secret Santa for</p>
            <Avatar person={giftee} size={240} className="hero-face" />
            <p className="hero-name">{giftee.name}</p>
            <p className="whisper">🤫 Keep it secret!</p>
            <button onClick={onClose}>Done</button>
          </div>
        )}
      </div>

      <button className="close" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}
