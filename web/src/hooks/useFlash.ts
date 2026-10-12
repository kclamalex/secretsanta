import { useEffect, useRef, useState } from "react";

/** A flag that turns itself off after `ms`, e.g. a "Copied!" label. */
export function useFlash(ms = 1500): [on: boolean, flash: () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => {
    setOn(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), ms);
  };
  return [on, flash];
}
