/**
 * JSON over fetch against /api. A Blob body is sent as-is with its own content type.
 * Non-2xx responses throw an Error carrying the server's `{ error }` message.
 */
export async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isBlob = body instanceof Blob;
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": isBlob ? body.type : "application/json", ...headers },
    body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** `request` with fixed headers and a path prefix, for calls that all share one credential. */
export function scopedRequest(prefix: string, headers: Record<string, string>) {
  return <T>(method: string, path = "", body?: unknown) => request<T>(method, `${prefix}${path}`, body, headers);
}
