/**
 * Backend JSON seam for intake-guard-v1.
 * Short-circuits /api/health, /api/intake-guard/summary, /api/intake-guard/check
 * BEFORE TanStack SPA so callers get JSON (not HTML 404).
 *
 * Mirrors server/middleware/grok-pwa.ts (event + next) so it works with the
 * existing Nitro serverDir scan used by this app.
 */
import {
  PACK,
  checkIntake,
  recordIntake,
  summary,
  type IntakeFingerprintInput,
} from "../../src/lib/intake-guard";
import {
  RING_PACK,
  clientIpFromHeaders,
  clientKeyFrom,
  ringGuardSummary,
  takeSubmit,
} from "../../src/lib/ring-guard";

interface PackEvent {
  url: URL;
  req: Request & { method: string; headers: Headers };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await req.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function fingerprintFromBody(body: Record<string, unknown>): IntakeFingerprintInput & {
  force?: boolean;
} {
  const str = (k: string) => {
    const v = body[k];
    return v == null ? "" : String(v);
  };
  return {
    product: str("product"),
    quantity: str("quantity"),
    unit: str("unit"),
    businessLicense: str("businessLicense") || str("business_license"),
    rcn: str("rcn"),
    force: Boolean(body.force),
  };
}

export default async function intakePackMiddleware(
  event: PackEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  const path = event.url.pathname;

  if (method === "GET" && path === "/api/health") {
    return json({
      ok: true,
      service: "mcsc-intake",
      packs: [PACK, RING_PACK],
      pack: PACK,
      ts: new Date().toISOString(),
    });
  }

  // ring-guard-v1 (read-only status; no IPs exposed)
  if (method === "GET" && path === "/api/ring-guard/summary") {
    return json(ringGuardSummary());
  }

  // ring-guard-v1 dry-run probe: evaluates this caller against the per-client
  // submit limit in a separate probe bucket. Never files an intake, never rings
  // the desk, never counts toward real submit totals.
  if (method === "POST" && path === "/api/ring-guard/check") {
    const body = await readJsonBody(event.req);
    const key = clientKeyFrom(clientIpFromHeaders((n) => event.req.headers.get(n)));
    const decision = takeSubmit(key, { probe: true, record: body.record === true });
    return json({ ...decision, probe: true, recorded: body.record === true && decision.allow });
  }

  if (method === "GET" && path === "/api/intake-guard/summary") {
    return json(summary());
  }

  if (method === "POST" && path === "/api/intake-guard/check") {
    const body = await readJsonBody(event.req);
    const input = fingerprintFromBody(body);
    const result = checkIntake(input);
    // Optional dry-run record when caller asks record=true and allow
    if (body.record === true && result.allow && !result.blocked) {
      recordIntake({ ...input, source: "api-check" });
    }
    return json(result);
  }

  return next();
}
