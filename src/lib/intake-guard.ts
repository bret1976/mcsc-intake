/**
 * Intake Guard Pack — soft-block near-identical open intakes within a window.
 *
 * Idea inspiration (no code copied):
 * - Matthew-Selvam/Open-Dispatch (MIT) — queue/no re-publish fingerprint + ledger
 * - rune0-dev/agent-ledger (HN Show) — prevent duplicate agent side effects
 * - Prior autopilot-mcp run-guard-v1 pattern (fingerprint + sliding window)
 *
 * Original TypeScript only. Fingerprint: product|quantity|unit|businessLicense|rcn.
 * Process-local ledger (globalThis) + optional JSON file under /tmp.
 * Env: INTAKE_GUARD_WINDOW_SEC (default 86400), INTAKE_GUARD_BLOCK (default on),
 *      INTAKE_GUARD_LEDGER (optional path override).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { assertSubmitAllowed } from "./ring-guard";
import { currentClientKey } from "./ring-guard-request.server";

export const PACK = "intake-guard-v1";
const DEFAULT_WINDOW_SEC = 24 * 60 * 60;
const DEFAULT_MAX_LEDGER = 800;

export type IntakeFingerprintInput = {
  product?: string | null;
  quantity?: string | null;
  unit?: string | null;
  businessLicense?: string | null;
  rcn?: string | null;
};

export type LedgerRow = {
  fingerprint: string;
  product: string;
  quantity: string;
  unit: string;
  businessLicense: string;
  rcn: string;
  digest: string;
  source?: string;
  ts: number;
};

type GuardStore = {
  rows: LedgerRow[];
};

declare global {
  // eslint-disable-next-line no-var
  var __mcscIntakeGuardStore: GuardStore | undefined;
}

function truthy(name: string, defaultValue = "1"): boolean {
  const raw = process.env[name];
  const v = (raw == null ? defaultValue : raw).trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off" && v !== "";
}

export function windowSec(): number {
  try {
    return Math.max(60, Number.parseInt(process.env.INTAKE_GUARD_WINDOW_SEC || "", 10) || DEFAULT_WINDOW_SEC);
  } catch {
    return DEFAULT_WINDOW_SEC;
  }
}

export function blockingEnabled(): boolean {
  return truthy("INTAKE_GUARD_BLOCK", "1");
}

function ledgerPath(): string {
  const override = process.env.INTAKE_GUARD_LEDGER?.trim();
  if (override) return override;
  return "/tmp/mcsc-intake-guard-ledger.json";
}

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function store(): GuardStore {
  if (!globalThis.__mcscIntakeGuardStore) {
    globalThis.__mcscIntakeGuardStore = { rows: loadLedgerFile() };
  }
  return globalThis.__mcscIntakeGuardStore;
}

function loadLedgerFile(): LedgerRow[] {
  const path = ledgerPath();
  try {
    if (!existsSync(path)) return [];
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((row): row is LedgerRow => !!row && typeof row === "object" && typeof (row as LedgerRow).fingerprint === "string");
  } catch {
    return [];
  }
}

function saveLedgerFile(rows: LedgerRow[]): void {
  const path = ledgerPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
    renameSync(tmp, path);
  } catch {
    // Ephemeral FS / read-only — keep in-memory only.
  }
}

function prune(rows: LedgerRow[], now = Date.now() / 1000): LedgerRow[] {
  const window = windowSec();
  let kept = rows.filter((r) => typeof r.ts === "number" && now - r.ts <= window);
  if (kept.length > DEFAULT_MAX_LEDGER) kept = kept.slice(-DEFAULT_MAX_LEDGER);
  return kept;
}

/** Stable fingerprint for one open intake unit. */
export function intakeFingerprint(input: IntakeFingerprintInput): string | null {
  const product = norm(input.product);
  const quantity = norm(input.quantity);
  const unit = norm(input.unit);
  const businessLicense = norm(input.businessLicense);
  const rcn = norm(input.rcn);
  if (!product || !quantity || !unit) return null;
  const material = `${product}|${quantity}|${unit}|${businessLicense}|${rcn}`;
  const digest = createHash("sha256").update(material, "utf8").digest("hex").slice(0, 20);
  return `${product}|${unit}|${digest}`;
}

export function summary(): Record<string, unknown> {
  const s = store();
  s.rows = prune(s.rows);
  saveLedgerFile(s.rows);
  return {
    pack: PACK,
    blocking: blockingEnabled(),
    window_sec: windowSec(),
    ledger_size: s.rows.length,
    ledger_path: ledgerPath(),
  };
}

export type CheckResult = {
  pack: string;
  fingerprint: string | null;
  blocked: boolean;
  force: boolean;
  blocking_enabled: boolean;
  reason: string | null;
  match: {
    fingerprint?: string;
    ts?: number;
    age_sec?: number;
    source?: string;
  } | null;
  allow: boolean;
};

export function checkIntake(
  input: IntakeFingerprintInput & { force?: boolean; now?: number },
): CheckResult {
  const now = input.now ?? Date.now() / 1000;
  const fp = intakeFingerprint(input);
  const result: CheckResult = {
    pack: PACK,
    fingerprint: fp,
    blocked: false,
    force: Boolean(input.force),
    blocking_enabled: blockingEnabled(),
    reason: null,
    match: null,
    allow: true,
  };
  if (!fp) {
    result.reason = "no_fingerprint";
    return result;
  }
  if (input.force) {
    result.reason = "forced";
    return result;
  }

  const s = store();
  s.rows = prune(s.rows, now);
  const exact = [...s.rows].reverse().find((r) => r.fingerprint === fp);
  if (exact) {
    result.match = {
      fingerprint: exact.fingerprint,
      ts: exact.ts,
      age_sec: Math.round((now - exact.ts) * 10) / 10,
      source: exact.source,
    };
    if (blockingEnabled()) {
      result.blocked = true;
      result.allow = false;
      result.reason = "duplicate_fingerprint";
    } else {
      result.reason = "duplicate_fingerprint_soft";
    }
    return result;
  }

  result.reason = "ok";
  return result;
}

export function recordIntake(
  input: IntakeFingerprintInput & { source?: string; now?: number },
): Record<string, unknown> {
  const now = input.now ?? Date.now() / 1000;
  const fp = intakeFingerprint(input);
  if (!fp) return { pack: PACK, recorded: false, reason: "no_fingerprint" };
  const row: LedgerRow = {
    fingerprint: fp,
    product: norm(input.product),
    quantity: norm(input.quantity),
    unit: norm(input.unit),
    businessLicense: norm(input.businessLicense),
    rcn: norm(input.rcn),
    digest: fp.split("|").pop() || "",
    source: input.source || "submit",
    ts: now,
  };
  const s = store();
  s.rows = prune(s.rows, now);
  s.rows.push(row);
  s.rows = prune(s.rows, now);
  saveLedgerFile(s.rows);
  return { pack: PACK, recorded: true, fingerprint: fp, ledger_size: s.rows.length };
}

/** Throw a clear Error when a submit should soft-block (for createServerFn UI). */
export function assertAllowedOrThrow(input: IntakeFingerprintInput): void {
  const result = checkIntake(input);
  if (!result.blocked) {
    // ring-guard-v1: per-client + global submit flood brake (RING_GUARD=0 disables).
    assertSubmitAllowed(currentClientKey());
    return;
  }
  const age = result.match?.age_sec != null ? ` (~${Math.round(result.match.age_sec)}s ago)` : "";
  throw new Error(
    `Duplicate intake blocked: the same product/quantity/unit/license/RCN was already filed recently${age}. Wait or change the request. (intake-guard-v1)`,
  );
}
