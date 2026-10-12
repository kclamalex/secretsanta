import type { Ref } from "react";
import { SnowflakeIcon } from "../../components/icons.tsx";

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

/** The wax seal's stamped disc. Whole on the envelope; the reveal also renders two halves that split apart. */
export function Wax({ whole = false, ref }: { whole?: boolean; ref?: Ref<HTMLSpanElement> }) {
  return (
    <span ref={ref} className={whole ? "wax whole" : "wax"} aria-hidden>
      <SnowflakeIcon />
    </span>
  );
}
