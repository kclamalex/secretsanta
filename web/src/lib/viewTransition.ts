import { flushSync } from "react-dom";
import { prefersReducedMotion } from "./device.ts";

/**
 * Grows `from` into the element matching `toSelector` (which `update` renders) as one shared
 * element, using the View Transitions API. Where that's unsupported or motion is reduced, just runs `update`.
 */
export function morphInto(from: HTMLElement | null, toSelector: string, update: () => void, name = "morph") {
  if (!from || prefersReducedMotion() || typeof document.startViewTransition !== "function") return update();
  const target = () => document.querySelector<HTMLElement>(toSelector);
  from.style.viewTransitionName = name;
  const transition = document.startViewTransition(() => {
    flushSync(update);
    from.style.viewTransitionName = "";
    const el = target();
    if (el) el.style.viewTransitionName = name;
  });
  transition.finished.finally(() => {
    const el = target();
    if (el) el.style.viewTransitionName = "";
  });
}
