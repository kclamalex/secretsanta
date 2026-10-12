import { HttpError } from "./errors.ts";

/** A trimmed, non-empty string of at most `max` characters. */
export function requireText(value: unknown, field: string, max = 60): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${field} is required`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return text;
}

/** A positive integer id, e.g. from a route param. */
export function requireId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `${field} is invalid`);
  return id;
}

/** An integer between `min` and `max`, inclusive. */
export function requireInt(value: unknown, field: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} must be between ${min} and ${max}`);
  return n;
}
