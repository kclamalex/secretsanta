import { useFlash } from "../hooks/useFlash.ts";
import { copyText } from "../lib/clipboard.ts";

/**
 * Opens the iOS / macOS share sheet so people pick the app (Messages, WhatsApp, Mail, AirDrop…).
 * Browsers only offer the share sheet over HTTPS; elsewhere the button copies the text and link instead.
 */
export function ShareButton({ title, text, url }: { title: string; text: string; url: string }) {
  const [copied, flash] = useFlash();
  const canShare = typeof navigator.share === "function";

  const share = async () => {
    if (canShare) return navigator.share({ title, text, url }).catch(() => {}); // user closed the sheet
    if (await copyText(`${text} ${url}`)) flash();
  };

  return <button onClick={share}>{canShare ? "Share invite…" : copied ? "Copied!" : "Copy invite"}</button>;
}

/** Copies `text` and confirms with "Copied!" for a moment. */
export function CopyButton({ text, label, className = "secondary" }: { text: string; label: string; className?: string }) {
  const [copied, flash] = useFlash();
  return (
    <button className={className} onClick={async () => (await copyText(text)) && flash()}>
      {copied ? "Copied!" : label}
    </button>
  );
}
