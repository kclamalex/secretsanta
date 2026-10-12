import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** A cryptographically random string drawn from `alphabet`. */
export const randomCode = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");

/** An unguessable URL-safe secret. */
export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

/** Constant-time string comparison, so response timing can't leak a secret. */
export function safeEqual(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
