import type { AnchorHTMLAttributes } from "react";
import { navigate } from "../lib/router.ts";

/** An <a> that changes page without a full reload. Modified clicks (new tab etc.) behave normally. */
export function Link({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
    />
  );
}
