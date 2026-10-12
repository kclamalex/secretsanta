import { useSyncExternalStore } from "react";
import { prefersReducedMotion, reducedMotionQuery } from "../lib/device.ts";

const subscribe = (onChange: () => void) => {
  const mq = reducedMotionQuery();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/** Live "prefers reduced motion" setting; re-renders when the user flips it. */
export const useReducedMotion = () => useSyncExternalStore(subscribe, prefersReducedMotion);
