import { useRef } from "react";
import { morphInto } from "../../lib/viewTransition.ts";
import { EnvelopeBody, Wax } from "../reveal/Envelope.tsx";

/** The sealed letter waiting on the join page. Where supported, it grows into the reveal's envelope. */
export function GiftTeaser({ opening, onOpen }: { opening: boolean; onOpen: () => void }) {
  const envelope = useRef<HTMLSpanElement>(null);
  return (
    <button type="button"
      className={`gift-card ${opening ? "is-open" : ""}`}
      onClick={() => morphInto(envelope.current, ".reveal-overlay .env", onOpen, "letter")}
    >
      <span ref={envelope} className="mini-env">
        <span className="env">
          <EnvelopeBody />
          <span className="seal"><Wax whole /></span>
        </span>
      </span>
      <span className="gift-card-text">
        <strong>A letter for you</strong>
        <span className="hint">Names are drawn. Open it somewhere private.</span>
      </span>
    </button>
  );
}
