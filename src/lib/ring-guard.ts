/**
 * Ring Guard Pack (ring-guard-v1) — flood brake for the public intake form and
 * the desk doorbell.
 *
 * Why: every filed intake rings the desk on every configured channel (phone
 * push, Resend email, Twilio/Textbelt SMS, Signal/WhatsApp via CallMeBot,
 * webhook). The forms are public, and intake-guard-v1 only stops *identical*
 * repeats, so a bot varying the quantity could file hundreds of requests and
 * fire hundreds of paid SMS / pings at the desk.
 *
 * What it does (backend only, no UI changes):
 *  1. Submit throttle — per-client (hashed X-Real-IP) and global sliding windows on
 *     submitOpen / submitIntake. Over the limit, the submit throws a clear
 *     Error (the existing form already shows server errors). Generous defaults
 *     so a real buyer never hits it.
 *  2. Ring budget — at most N desk rings per window. Extra rings are held (the
 *     intake is still saved and shows on the desk); the next ping that goes out
 *     says how many were held so nothing is silently lost. Desk "test ping" is
 *     never throttled.
 *
 * Kill switch: RING_GUARD=0 (both features off; behavior identical to before).
 * Env: RING_GUARD_SUBMITS_PER_HOUR (10, per client), RING_GUARD_GLOBAL_SUBMITS_PER_HOUR
 *      (120), RING_GUARD_RINGS_PER_WINDOW (6), RING_GUARD_RING_WINDOW_SEC (600).
 * State is process memory only (resets on deploy/restart). No IPs are stored or
 * exposed — only a truncated salted SHA-256 per process. No outbound calls.
 *
 * Pattern inspiration (ideas only, original TypeScript, nothing vendored):
 *  - express-rate-limit/express-rate-limit (MIT) — per-client window + Retry-After
 *  - animir/node-rate-limiter-flexible (ISC) — keyed limiter + global limiter
 *  - prometheus/alertmanager (Apache-2.0) — notification grouping/repeat budget
 *  - binwiederhier/ntfy (Apache-2.0) — per-visitor message rate limits
 */
import { createHash, randomBytes } from "node:crypto";

export const RING_PACK = "ring-guard-v1";

const HOUR = 3600;
const MAX_KEYS = 2000;
const MAX_GLOBAL = 5000;

type Store = {
  salt: string;
  bootTs: number;
  submits: Map<string, number[]>; // client key -> accepted submit timestamps (sec)
  probes: Map<string, number[]>; // dry-run probe key -> timestamps (sec)
  globalSubmits: number[];
  rings: number[]; // sent doorbell timestamps (sec)
  heldSinceLastRing: number;
  totals: {
    submitsAllowed: number;
    submitsBlockedClient: number;
    submitsBlockedGlobal: number;
    ringsSent: number;
    ringsHeld: number;
    testPingsBypassed: number;
  };
  lastBlockedAt: number | null;
  lastHeldAt: number | null;
};

declare global {
  var __mcscRingGuardStore: Store | undefined;
}

function freshStore(now: number): Store {
  return {
    salt: randomBytes(16).toString("hex"),
    bootTs: now,
    submits: new Map(),
    probes: new Map(),
    globalSubmits: [],
    rings: [],
    heldSinceLastRing: 0,
    totals: {
      submitsAllowed: 0,
      submitsBlockedClient: 0,
      submitsBlockedGlobal: 0,
      ringsSent: 0,
      ringsHeld: 0,
      testPingsBypassed: 0,
    },
    lastBlockedAt: null,
    lastHeldAt: null,
  };
}

function store(now = nowSec()): Store {
  if (!globalThis.__mcscRingGuardStore) {
    globalThis.__mcscRingGuardStore = freshStore(now);
  }
  return globalThis.__mcscRingGuardStore;
}

/** Test helper: drop all state. */
export function resetRingGuard(): void {
  globalThis.__mcscRingGuardStore = undefined;
}

function nowSec(): number {
  return Date.now() / 1000;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw == null || raw.trim() === "" ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function ringGuardEnabled(): boolean {
  const v = String(process.env.RING_GUARD ?? "1").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
}

export function ringGuardConfig() {
  return {
    submits_per_hour_per_client: intEnv("RING_GUARD_SUBMITS_PER_HOUR", 10, 1, 1000),
    global_submits_per_hour: intEnv("RING_GUARD_GLOBAL_SUBMITS_PER_HOUR", 120, 1, 100000),
    rings_per_window: intEnv("RING_GUARD_RINGS_PER_WINDOW", 6, 1, 1000),
    ring_window_sec: intEnv("RING_GUARD_RING_WINDOW_SEC", 600, 30, 86400),
  };
}

function trim(list: number[], now: number, window: number, cap: number): number[] {
  let kept = list.filter((t) => now - t < window);
  if (kept.length > cap) kept = kept.slice(-cap);
  return kept;
}

function pruneKeys(map: Map<string, number[]>, now: number): void {
  for (const [k, v] of map) {
    const kept = trim(v, now, HOUR, 1000);
    if (kept.length === 0) map.delete(k);
    else map.set(k, kept);
  }
  // Hard cap on distinct keys: drop the oldest-touched first.
  if (map.size > MAX_KEYS) {
    const order = [...map.entries()].sort(
      (a, b) => (a[1][a[1].length - 1] ?? 0) - (b[1][b[1].length - 1] ?? 0),
    );
    for (const [k] of order.slice(0, map.size - MAX_KEYS)) map.delete(k);
  }
}

/** Hash a raw client id (IP) so nothing identifying is kept. */
export function clientKeyFrom(raw: string | null | undefined): string {
  const id = String(raw ?? "").trim().toLowerCase();
  if (!id) return "anon";
  const s = store();
  return createHash("sha256").update(`${s.salt}|${id}`, "utf8").digest("hex").slice(0, 16);
}

/**
 * Client IP from proxy headers. Railway's edge sets X-Real-IP to the caller's
 * remote IP (docs: networking/public-networking/specs-and-limits), so it wins;
 * the first X-Forwarded-For hop is only a fallback for other hosts.
 */
export function clientIpFromHeaders(get: (name: string) => string | null | undefined): string {
  const real = String(get("x-real-ip") ?? "").trim();
  if (real) return real;
  const xff = String(get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  if (xff) return xff;
  return String(get("cf-connecting-ip") ?? "").trim();
}

export type SubmitDecision = {
  pack: string;
  enabled: boolean;
  allow: boolean;
  reason: "ok" | "disabled" | "client_limit" | "global_limit";
  client_used: number;
  client_limit: number;
  global_used: number;
  global_limit: number;
  retry_after_sec: number;
};

function decide(
  list: number[],
  globalList: number[],
  now: number,
  cfg: ReturnType<typeof ringGuardConfig>,
): Omit<SubmitDecision, "pack" | "enabled"> {
  const base = {
    client_used: list.length,
    client_limit: cfg.submits_per_hour_per_client,
    global_used: globalList.length,
    global_limit: cfg.global_submits_per_hour,
  };
  if (list.length >= cfg.submits_per_hour_per_client) {
    const oldest = list[list.length - cfg.submits_per_hour_per_client] ?? now;
    return {
      ...base,
      allow: false,
      reason: "client_limit",
      retry_after_sec: Math.max(1, Math.ceil(oldest + HOUR - now)),
    };
  }
  if (globalList.length >= cfg.global_submits_per_hour) {
    const oldest = globalList[globalList.length - cfg.global_submits_per_hour] ?? now;
    return {
      ...base,
      allow: false,
      reason: "global_limit",
      retry_after_sec: Math.max(1, Math.ceil(oldest + HOUR - now)),
    };
  }
  return { ...base, allow: true, reason: "ok", retry_after_sec: 0 };
}

/**
 * Check (and, when allowed, count) one intake submit for a client key.
 * `probe: true` evaluates against a separate dry-run bucket that never touches
 * real submit counts (used by POST /api/ring-guard/check for live smoke tests).
 */
export function takeSubmit(
  clientKey: string,
  opts: { now?: number; probe?: boolean; record?: boolean } = {},
): SubmitDecision {
  const now = opts.now ?? nowSec();
  const cfg = ringGuardConfig();
  const enabled = ringGuardEnabled();
  const s = store(now);
  if (!enabled) {
    return {
      pack: RING_PACK,
      enabled,
      allow: true,
      reason: "disabled",
      client_used: 0,
      client_limit: cfg.submits_per_hour_per_client,
      global_used: 0,
      global_limit: cfg.global_submits_per_hour,
      retry_after_sec: 0,
    };
  }
  const map = opts.probe ? s.probes : s.submits;
  pruneKeys(map, now);
  s.globalSubmits = trim(s.globalSubmits, now, HOUR, MAX_GLOBAL);
  // "anon" = client unknown (no proxy headers / no request context): never lump
  // unknown callers into one shared bucket — only the global window applies.
  const perClient = clientKey !== "anon";
  const list = perClient ? map.get(clientKey) ?? [] : [];
  // Probes share the client limit but never count toward / against the global window.
  const d = decide(list, opts.probe ? [] : s.globalSubmits, now, cfg);
  if (opts.probe) d.global_used = s.globalSubmits.length;
  const record = opts.record ?? true;
  if (d.allow && record) {
    if (perClient) {
      list.push(now);
      map.set(clientKey, list);
    }
    if (!opts.probe) {
      s.globalSubmits.push(now);
      s.totals.submitsAllowed += 1;
    }
    d.client_used = list.length;
    if (!opts.probe) d.global_used = s.globalSubmits.length;
  } else if (!d.allow && !opts.probe) {
    if (d.reason === "client_limit") s.totals.submitsBlockedClient += 1;
    else s.totals.submitsBlockedGlobal += 1;
    s.lastBlockedAt = now;
  }
  return { pack: RING_PACK, enabled, ...d };
}

/** Throw a clear, user-facing Error when a submit is over the limit. */
export function assertSubmitAllowed(clientKey: string, now?: number): void {
  const d = takeSubmit(clientKey, { now });
  if (d.allow) return;
  const mins = Math.max(1, Math.ceil(d.retry_after_sec / 60));
  if (d.reason === "client_limit") {
    throw new Error(
      `Too many requests from this connection in the last hour. Please try again in about ${mins} min, or contact the desk directly. (ring-guard-v1)`,
    );
  }
  throw new Error(
    `The desk is receiving an unusual number of requests right now. Please try again in about ${mins} min. (ring-guard-v1)`,
  );
}

export type RingGate = {
  pack: string;
  allow: boolean;
  reason: "ok" | "disabled" | "test_ping" | "ring_budget";
  held_before: number;
  body_suffix: string;
};

/**
 * Ask before ringing the desk. `test: true` (desk "send test ping") always
 * passes. When allowed, `body_suffix` reports rings held since the last one.
 */
export function ringGate(opts: { test?: boolean; now?: number } = {}): RingGate {
  const now = opts.now ?? nowSec();
  const s = store(now);
  if (!ringGuardEnabled()) {
    return { pack: RING_PACK, allow: true, reason: "disabled", held_before: 0, body_suffix: "" };
  }
  if (opts.test) {
    s.totals.testPingsBypassed += 1;
    return { pack: RING_PACK, allow: true, reason: "test_ping", held_before: 0, body_suffix: "" };
  }
  const cfg = ringGuardConfig();
  s.rings = trim(s.rings, now, cfg.ring_window_sec, 10000);
  if (s.rings.length >= cfg.rings_per_window) {
    s.heldSinceLastRing += 1;
    s.totals.ringsHeld += 1;
    s.lastHeldAt = now;
    return { pack: RING_PACK, allow: false, reason: "ring_budget", held_before: s.heldSinceLastRing, body_suffix: "" };
  }
  const held = s.heldSinceLastRing;
  s.heldSinceLastRing = 0;
  s.rings.push(now);
  s.totals.ringsSent += 1;
  const suffix =
    held > 0
      ? ` (+${held} more filed while pings were on hold — check the desk)`
      : "";
  return { pack: RING_PACK, allow: true, reason: "ok", held_before: held, body_suffix: suffix };
}

function iso(ts: number | null): string | null {
  return ts == null ? null : new Date(ts * 1000).toISOString();
}

/** Read-only status for /api/ring-guard/summary and /api/health. No IPs. */
export function ringGuardSummary(now = nowSec()): Record<string, unknown> {
  const s = store(now);
  const cfg = ringGuardConfig();
  pruneKeys(s.submits, now);
  pruneKeys(s.probes, now);
  s.globalSubmits = trim(s.globalSubmits, now, HOUR, MAX_GLOBAL);
  s.rings = trim(s.rings, now, cfg.ring_window_sec, 10000);
  const enabled = ringGuardEnabled();
  let status = "ok";
  if (!enabled) status = "disabled";
  else if (s.heldSinceLastRing > 0 || s.rings.length >= cfg.rings_per_window) status = "pings_held";
  else if (s.globalSubmits.length >= cfg.global_submits_per_hour) status = "submits_limited";
  return {
    pack: RING_PACK,
    enabled,
    status,
    config: cfg,
    window: {
      submits_last_hour: s.globalSubmits.length,
      active_clients_last_hour: s.submits.size,
      rings_in_ring_window: s.rings.length,
      rings_held_pending: s.heldSinceLastRing,
    },
    totals_since_boot: { ...s.totals },
    last_blocked_at: iso(s.lastBlockedAt),
    last_held_at: iso(s.lastHeldAt),
    since: iso(s.bootTs),
    state: "memory (resets on deploy/restart)",
  };
}
