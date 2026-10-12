import { useState } from "react";

/** Copies text, falling back to a prompt where the clipboard API is blocked (plain http on a LAN). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this:", text);
    return false;
  }
}

/**
 * Opens the iOS / macOS share sheet so people pick the app (Messages, WhatsApp, Mail, AirDrop…).
 * Browsers only offer the share sheet over HTTPS; elsewhere the button copies the invite instead.
 */
export function ShareButtons({ title, text, url }: { title: string; text: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === "function";

  const share = async () => {
    if (canShare) return navigator.share({ title, text, url }).catch(() => {}); // user closed the sheet
    if (await copyText(`${text} ${url}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button onClick={share}>{canShare ? "Share invite…" : copied ? "Copied!" : "Copy invite"}</button>
  );
}
