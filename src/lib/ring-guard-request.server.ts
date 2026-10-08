/**
 * ring-guard-v1: resolve a hashed client key for the current TanStack Start
 * request (server functions). Never throws — outside a request it returns
 * "anon" so callers keep working exactly as before.
 */
import { getRequest } from "@tanstack/react-start/server";
import { clientIpFromHeaders, clientKeyFrom } from "./ring-guard";

export function currentClientKey(): string {
  try {
    const req = getRequest();
    if (!req) return "anon";
    return clientKeyFrom(clientIpFromHeaders((n) => req.headers.get(n)));
  } catch {
    return "anon";
  }
}
