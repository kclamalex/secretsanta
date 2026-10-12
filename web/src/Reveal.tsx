import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Participant } from "./api.ts";
import { useHideAmbientSnow } from "./AmbientSnow.tsx";
import { Avatar } from "./Avatar.tsx";
import { CloseIcon, SnowflakeIcon, SoundOffIcon, SoundOnIcon } from "./icons.tsx";
import { createScene, type Scene } from "./particles.ts";
import * as sound from "./sound.ts";

type Phase = "idle" | "crack" | "open" | "rise" | "lift" | "flip" | "revealed";
const PHASES: Phase[] = ["idle", "crack", "open", "rise", "lift", "flip", "revealed"];

/** When each beat starts, in ms after the seal breaks. */
const TIMELINE: [Phase, number][] = [["open", 300], ["rise", 900], ["lift", 1350], ["flip", 1800], ["revealed", 2500]];
const EDGE_ON_MS = 2150; // the flip uses a symmetric ease, so the card is edge-on halfway through it
const HOLD_MS = 1100;
const TAP_MS = 250;
const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern); // Android only; iOS ignores it

/** Envelope and card sizes for this viewport. The card is laid out at its final size and scaled down to fit the envelope, so its text is crisp once it lands. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const envW = Math.min(vw * 0.78, 340);
  const envH = envW * 0.66;
  let cardW = Math.min(vw - 40, 420);
  let cardH = cardW * 0.76;
  const maxH = Math.max(200, vh - 260); // room for the corner buttons and "Done"
  if (cardH > maxH) [cardH, cardW] = [maxH, maxH / 0.76];
  return {
    avatar: Math.round(Math.min(120, cardH * 0.4)),
    style: {
      "--env-w": `${envW}px`,
      "--env-h": `${envH}px`,
      "--card-w": `${cardW}px`,
      "--card-h": `${cardH}px`,
      "--card-y": "-50px",
      "--k": (envW * 0.84) / cardW,
    } as CSSProperties,
  };
}

/** The paper of the envelope, back to front; the seal goes on top. Spans, so the small teaser on the join page can reuse it inside a button. */
export function EnvelopeBody() {
  return (
    <>
      <span className="env-back" />
      <span className="env-pocket">
        <i className="pocket-l" />
        <i className="pocket-r" />
        <i className="pocket-fold"><i /></i>
        <i className="pocket-b" />
      </span>
      <span className="env-edge shadow"><i /></span>
      <span className="env-edge leak"><i /></span>
      <span className="env-flap">
        <i className="flap-out" />
        <i className="flap-in" />
      </span>
    </>
  );
}

/**
 * Full-screen reveal, "the sealed letter": press and hold a wax seal until it cracks, the
 * flap opens, a card rises out of the envelope, comes to the camera and turns over to show
 * the match in gold foil.
 */
export function Reveal({
  giftee,
  pool,
  onRevealed,
  onClose,
}: {
  giftee: Participant;
  /** Everyone else in the draw; their photos are preloaded. */
  pool: Participant[];
  onRevealed: () => void;
  onClose: () => void;
}) {
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [phase, setPhase] = useState<Phase>("idle");
  const [hinted, setHinted] = useState(false);
  const [muted, setMuted] = useState(sound.isMuted);
  const [geo, setGeo] = useState(measure);

  const root = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const seal = useRef<HTMLButtonElement>(null);
  const wax = useRef<HTMLSpanElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const hold = useRef({ active: false, p: 0, shown: -1, since: 0, ticks: 0, taps: 0 });
  const hum = useRef<ReturnType<typeof sound.hum> | null>(null);
  const timers = useRef<number[]>([]);
  const revealed = useRef(false);
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;

  useHideAmbientSnow(); // this overlay has its own, denser snow

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    for (const p of [giftee, ...pool]) if (p.avatarUrl) new Image().src = p.avatarUrl;
    document.fonts?.load('600 1em "Fraunces"').catch(() => {}); // so the name doesn't reflow mid-animation
    return () => {
      document.body.style.overflow = previous;
    };
  }, [pool, giftee]);

  useEffect(() => {
    const onResize = () => setGeo(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // One loop for everything: snow, particles, the hold and the pointer tilt.
  useEffect(() => {
    const el = root.current;
    if (!el || !back.current || !front.current) return;
    const target = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0, shownX: 1, shownY: 1 };

    const onFrame = (dt: number) => {
      const h = hold.current;
      const s = scene.current;
      if (h.active) h.p = Math.min(1, h.p + dt / HOLD_MS);
      else h.p = h.p < 0.002 ? 0 : h.p * Math.exp(-dt / 120); // let go early: ease back, no jump
      if (h.p !== h.shown) {
        h.shown = h.p;
        const eased = 1 - (1 - h.p) ** 2;
        el.style.setProperty("--hold", eased.toFixed(4));
        ring.current?.style.setProperty("stroke-dashoffset", String(1 - h.p));
        s?.setTimeScale(1 - 0.6 * eased);
        hum.current?.set(h.p);
        const step = Math.floor(h.p * 5);
        if (h.active && step > h.ticks) {
          h.ticks = step;
          vibrate(8);
        }
      }
      if (h.active && h.p >= 1) breakSeal();

      const k = 1 - Math.exp(-dt / 160);
      tilt.x += (target.x - tilt.x) * k;
      tilt.y += (target.y - tilt.y) * k;
      if (Math.abs(tilt.x - tilt.shownX) > 0.001 || Math.abs(tilt.y - tilt.shownY) > 0.001) {
        tilt.shownX = tilt.x;
        tilt.shownY = tilt.y;
        el.style.setProperty("--rx", tilt.x.toFixed(4));
        el.style.setProperty("--ry", tilt.y.toFixed(4));
        s?.setParallax(tilt.x, tilt.y);
      }
    };
    scene.current = createScene(back.current, front.current, { reduced, onFrame });

    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const onMove = (e: globalThis.PointerEvent) => {
      target.x = clamp((e.clientX / window.innerWidth) * 2 - 1);
      target.y = clamp((e.clientY / window.innerHeight) * 2 - 1);
    };
    // Phone tilt only where it needs no permission prompt (iOS asks; Android doesn't).
    let baseBeta: number | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      baseBeta ??= e.beta;
      target.x = clamp(e.gamma / 25);
      target.y = clamp((e.beta - baseBeta) / 25);
    };
    const orientation = window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined;
    const useOrientation = !reduced && orientation && typeof orientation.requestPermission !== "function";
    if (!reduced) window.addEventListener("pointermove", onMove);
    if (useOrientation) window.addEventListener("deviceorientation", onOrient);
    seal.current?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onOrient);
      timers.current.forEach(clearTimeout);
      timers.current = [];
      hum.current?.stop(true);
      hum.current = null;
      scene.current?.stop();
      scene.current = null;
      sound.stopAll();
    };
  }, []);

  const reveal = () => {
    if (revealed.current) return;
    revealed.current = true;
    sound.chime();
    vibrate([30, 40, 60]);
    onRevealedRef.current();
  };

  function breakSeal() {
    if (phaseRef.current !== "idle") return;
    const h = hold.current;
    h.active = false;
    hum.current?.stop(true);
    hum.current = null;
    if (reduced) {
      go("revealed");
      reveal();
      return;
    }
    go("crack");
    sound.crack();
    vibrate(20);
    const r = seal.current?.getBoundingClientRect();
    if (r) scene.current?.crumbs(r.left + r.width / 2, r.top + r.height / 2);
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    later(300, sound.rustle);
    for (const [p, ms] of TIMELINE) later(ms, () => go(p));
    later(EDGE_ON_MS, reveal);
    later(2500, () => {
      const c = card.current?.getBoundingClientRect();
      if (c) scene.current?.foil(c);
    });
  }

  const startHold = () => {
    const h = hold.current;
    if (phaseRef.current !== "idle" || h.active) return;
    sound.unlock(); // must happen inside the gesture for iOS to allow audio
    if (reduced) return breakSeal();
    h.active = true;
    h.since = performance.now();
    h.ticks = Math.floor(h.p * 5);
    hum.current = sound.hum();
  };

  const endHold = () => {
    const h = hold.current;
    if (!h.active) return;
    h.active = false;
    hum.current?.stop();
    hum.current = null;
    if (performance.now() - h.since > TAP_MS) return;
    // A quick tap nudges the seal and explains; a second one opens anyway, so holding is never required.
    if (h.taps++ > 0) return breakSeal();
    setHinted(true);
    wax.current?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.12) rotate(-4deg)" }, { transform: "scale(0.96) rotate(2deg)" }, { transform: "none" }],
      { duration: 480, easing: "cubic-bezier(.3,.7,.3,1)" },
    );
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || phaseRef.current !== "idle") return;
    e.currentTarget.setPointerCapture(e.pointerId); // keep the hold if the finger drifts off the envelope
    startHold();
  };

  const isActivationKey = (e: KeyboardEvent) => e.key === "Enter" || e.key === " ";
  const onKeyDown = (e: KeyboardEvent) => {
    if (!isActivationKey(e)) return;
    e.preventDefault(); // no synthetic click: the hold handles it
    if (!e.repeat) startHold();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!isActivationKey(e)) return;
    e.preventDefault();
    endHold();
  };

  const toggleMute = () => {
    sound.setMuted(!muted);
    setMuted(!muted);
  };

  const reached = (p: Phase) => PHASES.indexOf(phase) >= PHASES.indexOf(p);
  const stages = PHASES.slice(1).filter(reached).map((p) => `at-${p}`).join(" ");
  const letters = [...giftee.name.trim()].length;
  let n = 0;

  return (
    <div
      ref={root}
      className={`reveal-overlay ${stages} ${hinted ? "hinted" : ""} ${reduced ? "reduced" : ""}`}
      style={geo.style}
      role="dialog"
      aria-modal="true"
      aria-label="Your Secret Santa match"
    >
      <div className="rv-keylight" aria-hidden />
      <canvas ref={back} className="rv-canvas" aria-hidden />
      <div className="rv-vignette" aria-hidden />
      <div className="rv-vignette tight" aria-hidden />

      <div
        className="rv-scene"
        onPointerDown={onPointerDown}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="rv-bloom" aria-hidden />
        <div className="rv-shadow" aria-hidden />
        <div className="rv-float">
          <div className="rv-tilt">
            <div className="env">
              <EnvelopeBody />
              <div className="env-glow" />
              <button
                ref={seal}
                className="seal"
                aria-label="Open your match"
                aria-describedby="rv-label"
                onKeyDown={onKeyDown}
                onKeyUp={onKeyUp}
                onClick={(e) => e.detail === 0 && breakSeal()} // screen readers "click" without keys or pointers
              >
                <svg className="seal-ring" viewBox="0 0 100 100" aria-hidden>
                  <circle className="track" cx="50" cy="50" r="48" />
                  <circle ref={ring} className="progress" cx="50" cy="50" r="48" pathLength={1} />
                </svg>
                <span ref={wax} className="wax whole" aria-hidden>
                  <SnowflakeIcon />
                </span>
                <span className="seal-half l" aria-hidden>
                  <span className="wax"><SnowflakeIcon /></span>
                </span>
                <span className="seal-half r" aria-hidden>
                  <span className="wax"><SnowflakeIcon /></span>
                </span>
              </button>
            </div>

            <div className="rv-card-clip">
              <div ref={card} className="rv-card">
                <div className="rv-card-flip">
                  <div className="rv-card-face rv-card-back" aria-hidden>
                    <span className="rv-card-mono"><SnowflakeIcon size={30} /></span>
                  </div>
                  <div className="rv-card-face rv-card-front" aria-live="polite">
                    {reached("flip") && (
                      <>
                        <p className="rv-kicker">You're Secret Santa for</p>
                        <span className="rv-face"><Avatar person={giftee} size={geo.avatar} /></span>
                        <p
                          className={`rv-name ${letters > 24 ? "xlong" : letters > 14 ? "long" : ""}`}
                          style={{ "--n": letters } as CSSProperties}
                        >
                          <span className="rv-sr">{giftee.name}</span>
                          {giftee.name.trim().split(/(\s+)/).map((word, w) =>
                            /^\s+$/.test(word) ? (
                              " "
                            ) : (
                              <span key={w} className="rv-word" aria-hidden>
                                {[...word].map((ch) => (
                                  <span key={n} className="ch" style={{ "--i": n++ } as CSSProperties}>{ch}</span>
                                ))}
                              </span>
                            ),
                          )}
                        </p>
                        <span className="rv-card-sheen" aria-hidden />
                        <span className="rv-card-spec" aria-hidden />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p id="rv-label" className="rv-label">
          {hinted ? "Hold the seal, or tap once more" : "Press and hold the seal"}
        </p>
        {reached("revealed") && (
          <div className="rv-after">
            <p className="rv-whisper">Keep it secret.</p>
            <button className="rv-done" onClick={onClose} autoFocus>Done</button>
          </div>
        )}
      </div>

      <canvas ref={front} className="rv-canvas" aria-hidden />
      <button className="corner mute" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
        {muted ? <SoundOffIcon /> : <SoundOnIcon />}
      </button>
      <button className="corner close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
    </div>
  );
}
