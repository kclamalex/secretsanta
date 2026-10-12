import type { CSSProperties, ReactNode } from "react";
import { ErrorText } from "./ErrorText.tsx";

/** A sheet of stationery. `rise` staggers it in on first mount (the nth card waits n × 60ms). */
export function Card({ title, rise, className = "", children }: { title?: ReactNode; rise?: number; className?: string; children: ReactNode }) {
  const style = rise === undefined ? undefined : ({ "--i": rise } as CSSProperties);
  return (
    <section className={`card ${rise === undefined ? "" : "rise"} ${className}`} style={style}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

/** Placeholder card while data loads, or the error if loading failed. */
export function LoadingCard({ error = null }: { error?: string | null }) {
  return <Card>{error ? <ErrorText error={error} /> : <p>Loading…</p>}</Card>;
}
