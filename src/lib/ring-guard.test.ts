import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSubmitAllowed,
  clientIpFromHeaders,
  clientKeyFrom,
  resetRingGuard,
  ringGate,
  ringGuardSummary,
  takeSubmit,
} from "./ring-guard.ts";

const ENV_KEYS = [
  "RING_GUARD",
  "RING_GUARD_SUBMITS_PER_HOUR",
  "RING_GUARD_GLOBAL_SUBMITS_PER_HOUR",
  "RING_GUARD_RINGS_PER_WINDOW",
  "RING_GUARD_RING_WINDOW_SEC",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  resetRingGuard();
});

describe("ring-guard-v1 submit throttle", () => {
  it("allows up to the per-client limit, then blocks with retry-after", () => {
    process.env.RING_GUARD_SUBMITS_PER_HOUR = "3";
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) {
      assert.equal(takeSubmit("a", { now: t0 + i }).allow, true);
    }
    const d = takeSubmit("a", { now: t0 + 10 });
    assert.equal(d.allow, false);
    assert.equal(d.reason, "client_limit");
    assert.ok(d.retry_after_sec > 3500 && d.retry_after_sec <= 3600);
    // A different client is unaffected.
    assert.equal(takeSubmit("b", { now: t0 + 10 }).allow, true);
  });

  it("recovers once the hour window slides past", () => {
    process.env.RING_GUARD_SUBMITS_PER_HOUR = "2";
    const t0 = 2_000_000;
    takeSubmit("a", { now: t0 });
    takeSubmit("a", { now: t0 + 1 });
    assert.equal(takeSubmit("a", { now: t0 + 2 }).allow, false);
    assert.equal(takeSubmit("a", { now: t0 + 3601 }).allow, true);
  });

  it("enforces the global window across many clients", () => {
    process.env.RING_GUARD_GLOBAL_SUBMITS_PER_HOUR = "5";
    const t0 = 3_000_000;
    for (let i = 0; i < 5; i += 1) assert.equal(takeSubmit(`c${i}`, { now: t0 + i }).allow, true);
    const d = takeSubmit("c99", { now: t0 + 6 });
    assert.equal(d.allow, false);
    assert.equal(d.reason, "global_limit");
  });

  it("never lumps unknown callers ('anon') into one per-client bucket", () => {
    process.env.RING_GUARD_SUBMITS_PER_HOUR = "1";
    const t0 = 4_000_000;
    for (let i = 0; i < 5; i += 1) assert.equal(takeSubmit("anon", { now: t0 + i }).allow, true);
  });

  it("probe bucket never touches real submit counts", () => {
    process.env.RING_GUARD_SUBMITS_PER_HOUR = "2";
    const t0 = 5_000_000;
    takeSubmit("a", { now: t0, probe: true });
    takeSubmit("a", { now: t0 + 1, probe: true });
    assert.equal(takeSubmit("a", { now: t0 + 2, probe: true }).allow, false);
    // Real submit for the same client is still allowed.
    assert.equal(takeSubmit("a", { now: t0 + 3 }).allow, true);
    const s = ringGuardSummary(t0 + 4) as { totals_since_boot: { submitsAllowed: number; submitsBlockedClient: number } };
    assert.equal(s.totals_since_boot.submitsAllowed, 1);
    assert.equal(s.totals_since_boot.submitsBlockedClient, 0);
  });

  it("assertSubmitAllowed throws a clear message over the limit", () => {
    process.env.RING_GUARD_SUBMITS_PER_HOUR = "1";
    const t0 = 6_000_000;
    assertSubmitAllowed("a", t0);
    assert.throws(() => assertSubmitAllowed("a", t0 + 1), /Too many requests.*ring-guard-v1/);
  });

  it("kill switch RING_GUARD=0 allows everything", () => {
    process.env.RING_GUARD = "0";
    process.env.RING_GUARD_SUBMITS_PER_HOUR = "1";
    for (let i = 0; i < 10; i += 1) assert.equal(takeSubmit("a", { now: 7_000_000 + i }).allow, true);
    assert.equal(ringGuardSummary().status, "disabled");
  });
});

describe("ring-guard-v1 doorbell budget", () => {
  it("holds rings over budget and reports them on the next doorbell", () => {
    process.env.RING_GUARD_RINGS_PER_WINDOW = "2";
    process.env.RING_GUARD_RING_WINDOW_SEC = "600";
    const t0 = 8_000_000;
    assert.equal(ringGate({ now: t0 }).allow, true);
    assert.equal(ringGate({ now: t0 + 1 }).allow, true);
    const held1 = ringGate({ now: t0 + 2 });
    const held2 = ringGate({ now: t0 + 3 });
    assert.equal(held1.allow, false);
    assert.equal(held2.reason, "ring_budget");
    assert.equal(ringGuardSummary(t0 + 4).status, "pings_held");
    const next = ringGate({ now: t0 + 601 });
    assert.equal(next.allow, true);
    assert.equal(next.held_before, 2);
    assert.match(next.body_suffix, /\+2 more filed/);
    // Counter resets after being reported.
    assert.equal(ringGate({ now: t0 + 602 }).body_suffix, "");
  });

  it("test pings always pass and do not consume budget", () => {
    process.env.RING_GUARD_RINGS_PER_WINDOW = "1";
    const t0 = 9_000_000;
    assert.equal(ringGate({ now: t0 }).allow, true);
    assert.equal(ringGate({ now: t0 + 1 }).allow, false);
    assert.equal(ringGate({ now: t0 + 2, test: true }).allow, true);
  });

  it("kill switch passes every doorbell", () => {
    process.env.RING_GUARD = "0";
    process.env.RING_GUARD_RINGS_PER_WINDOW = "1";
    for (let i = 0; i < 5; i += 1) assert.equal(ringGate({ now: 10_000_000 + i }).allow, true);
  });
});

describe("ring-guard-v1 client identity", () => {
  it("prefers Railway's X-Real-IP, then the first X-Forwarded-For hop", () => {
    const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
    assert.equal(clientIpFromHeaders(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
    assert.equal(clientIpFromHeaders(h({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
    assert.equal(clientIpFromHeaders(h({ "x-real-ip": "5.6.7.8", "x-forwarded-for": "6.6.6.6" })), "5.6.7.8");
    assert.equal(clientIpFromHeaders(h({})), "");
  });

  it("hashes ids (no raw IP kept) and maps empty to anon", () => {
    const k = clientKeyFrom("1.2.3.4");
    assert.equal(k.length, 16);
    assert.ok(!k.includes("1.2.3.4"));
    assert.equal(clientKeyFrom("1.2.3.4"), k);
    assert.equal(clientKeyFrom(""), "anon");
  });

  it("summary exposes counts only, never keys or IPs", () => {
    takeSubmit(clientKeyFrom("9.9.9.9"));
    const text = JSON.stringify(ringGuardSummary());
    assert.ok(!text.includes("9.9.9.9"));
    assert.ok(!text.includes(clientKeyFrom("9.9.9.9")));
  });
});
