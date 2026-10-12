import type { NextFunction, Request, Response } from "express";
import { BlockList, isIPv4 } from "node:net";
import { HttpError } from "./errors.ts";

/** Final middleware: HttpErrors keep their status, body-parser errors become 400/413, anything else is a 500. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON" });
  if ((err as { type?: string }).type === "entity.too.large") {
    return res.status(413).json({ error: "That file is too large" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
}

export const notFound = (_req: Request, _res: Response, next: NextFunction) => next(new HttpError(404, "Not found"));

// Loopback and private ranges: this machine, the Docker bridge, the home network.
const PRIVATE_NETWORKS = new BlockList();
for (const [net, prefix] of [["127.0.0.0", 8], ["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const) {
  PRIVATE_NETWORKS.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [["::1", 128], ["fc00::", 7], ["fe80::", 10]] as const) {
  PRIVATE_NETWORKS.addSubnet(net, prefix, "ipv6");
}
const PROXY_HEADERS = ["forwarded", "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip"];

/** True only for a direct connection from a private address. Anything relayed by a proxy or tunnel is public. */
export function isPrivateRequest(req: Request): boolean {
  if (PROXY_HEADERS.some((h) => req.get(h) !== undefined)) return false;
  const address = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  if (!address) return false;
  return PRIVATE_NETWORKS.check(address, isIPv4(address) ? "ipv4" : "ipv6");
}

/** Middleware that makes routes pretend not to exist for anything off the private network. */
export const privateNetworkOnly = (req: Request, res: Response, next: NextFunction) =>
  isPrivateRequest(req) ? next() : notFound(req, res, next);
