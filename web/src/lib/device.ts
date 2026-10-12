const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export const reducedMotionQuery = () => window.matchMedia(REDUCED_MOTION);

/** True when the user asked the OS for less animation. */
export const prefersReducedMotion = () => reducedMotionQuery().matches;

/** Haptic buzz. Android only; iOS ignores it. */
export const vibrate = (pattern: number | number[]) => navigator.vibrate?.(pattern);
