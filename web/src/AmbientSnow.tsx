import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createAmbientSnow } from "./particles.ts";

// How many full-screen overlays (the reveal) are open; they bring their own snow.
let overlays = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notify = () => listeners.forEach((fn) => fn());

/** Call from an overlay that has its own snow: the page snow unmounts while it's open. */
export function useHideAmbientSnow() {
  useEffect(() => {
    overlays++;
    notify();
    return () => {
      overlays--;
      notify();
    };
  }, []);
}

function SnowCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvas.current ? createAmbientSnow(canvas.current) : undefined), []);
  return <canvas ref={canvas} className="ambient-snow" aria-hidden />;
}

/** Sparse, dim snow behind the page. Off entirely under reduced motion. */
export function AmbientSnow() {
  const hidden = useSyncExternalStore(subscribe, () => overlays > 0);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return hidden || reduced ? null : <SnowCanvas />;
}
