import { useEffect, useState } from "react";

/** A history-API router small enough to read in one go. */

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** The current pathname, updated on navigate() and the back button. */
export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

/** A pattern and what to render for it; capture groups are passed as params. */
export type Route<T> = [pattern: RegExp, render: (params: string[]) => T];

/** Renders the first route whose pattern matches `path`, else `fallback`. */
export function matchRoute<T>(path: string, routes: Route<T>[], fallback: () => T): T {
  for (const [pattern, render] of routes) {
    const match = path.match(pattern);
    if (match) return render(match.slice(1));
  }
  return fallback();
}
