import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Link2, Plus } from "lucide-react";
import { McscMark } from "@/components/mark";
import { CopyFormLink } from "@/components/copy-form-link";
import { PingPanel } from "@/components/ping-panel";
import { SharePanel } from "@/components/share-panel";
import { Tracker } from "@/components/tracker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import {
  createLink,
  listLinks,
  setLinkStatus,
  type IntakeLink,
} from "@/lib/intake-api";
import { cn, formatWhen } from "@/lib/utils";

export function Desk({ initial }: { initial: IntakeLink[] }) {
  const router = useRouter();
  const [links, setLinks] = useState(initial);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<string | null>(
    initial[0]?.token ?? null,
  );

  useEffect(() => {
    setLinks(initial);
  }, [initial]);

  const seenFiled = useRef<Set<string> | null>(null);
  useEffect(() => {
    const filed = links.filter((l) => l.submittedAt);
    if (seenFiled.current === null) {
      seenFiled.current = new Set(filed.map((l) => l.id));
      return;
    }
    for (const link of filed) {
      if (seenFiled.current.has(link.id)) continue;
      seenFiled.current.add(link.id);
      const sub = link.submission;
      const body = sub
        ? `${sub.product} · ${sub.quantity} ${sub.unit}`
        : "A request just landed.";
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("MCSC Intake", { body });
        } catch {
          /* ignore */
        }
      }
    }
  }, [links]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const rows = await listLinks();
        if (!alive) return;
        setLinks(rows);
        setSelectedToken((cur) => {
          if (cur && rows.some((r) => r.token === cur)) return cur;
          return rows[0]?.token ?? null;
        });
      } catch {
        /* keep current list */
      }
    }
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const selected = useMemo(
    () => links.find((l) => l.token === selectedToken) ?? null,
    [links, selectedToken],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const link = await createLink({ data: { label: label.trim() } });
      setLinks((prev) => [link, ...prev]);
      setSelectedToken(link.token);
      setLabel("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create link.");
    } finally {
      setBusy(false);
    }
  }

  async function advance(status: "review" | "quoted" | "closed") {
    if (!selected) return;
    try {
      const updated = await setLinkStatus({
        data: { token: selected.token, status },
      });
      setLinks((prev) => prev.map((l) => (l.token === updated.token ? updated : l)));
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <McscMark className="size-10 text-primary" />
          <div>
            <p className="text-sm font-medium tracking-wide text-fg">MCSC</p>
            <h1 className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
              Intake desk
            </h1>
          </div>
        </div>
        <p className="hidden max-w-xs text-right text-xs text-muted sm:block">
          Send the form link. They fill it. Requests land here.
        </p>
      </header>

      <div className="mb-6 rounded-xl border border-border bg-surface p-4 shadow-panel sm:p-5">
        <p className="mb-1 text-sm font-medium text-fg">New link to send</p>
        <p className="mb-3 text-xs text-muted">
          Each New link is unique. Send that one. They fill it. It lands here.
        </p>
        <CopyFormLink />
        <Link
          to="/"
          className="mt-3 inline-block font-mono text-[11px] tracking-wider text-muted uppercase hover:text-fg"
        >
          Open the form
        </Link>
      </div>

      <PingPanel />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-panel sm:p-5">
          <h2 className="mb-3 text-sm font-medium text-fg">Tracked link</h2>
          <form onSubmit={onCreate} className="grid gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="label" className="text-xs font-medium tracking-wide text-muted">
                Counterparty desk{" "}
                <span className="font-normal text-subtle">(optional)</span>
              </label>
              <Input
                id="label"
                value={label}
                maxLength={80}
                placeholder="e.g. Gulf Coast trading"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy}>
              <Plus className="size-4" strokeWidth={1.75} />
              {busy ? "Creating…" : "Create link"}
            </Button>
          </form>
          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 font-mono text-[11px] tracking-wider text-subtle uppercase">
              Requests
            </p>
            {links.length === 0 ? (
              <p className="py-6 text-sm text-muted">
                No requests yet. Send the form link — filings show up here.
              </p>
            ) : (
              <ul className="grid gap-1">
                {links.map((link) => {
                  const active = link.token === selectedToken;
                  return (
                    <li key={link.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedToken(link.token)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150",
                          active ? "bg-surface-2" : "hover:bg-input",
                        )}
                      >
                        <Link2
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-primary" : "text-subtle",
                          )}
                          strokeWidth={1.75}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg">
                            {link.label || link.publicId}
                          </span>
                          <span className="block font-mono text-[11px] text-subtle">
                            {link.submission
                              ? `${link.submission.quantity} ${link.submission.unit} ${link.submission.product}`
                              : link.publicId}
                          </span>
                        </span>
                        <StatusBadge status={link.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 shadow-panel sm:p-6">
          {!selected ? (
            <EmptyDetail />
          ) : (
            <LinkDetail link={selected} onAdvance={advance} />
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex min-h-72 flex-col justify-center gap-3 py-10">
      <h2 className="text-lg font-medium text-fg">How it works</h2>
      <ol className="grid gap-3 text-sm text-muted">
        <li>
          <span className="font-mono text-xs text-subtle">01</span> Copy the
          form link and send it.
        </li>
        <li>
          <span className="font-mono text-xs text-subtle">02</span> They fill
          the web form. No login.
        </li>
        <li>
          <span className="font-mono text-xs text-subtle">03</span> The request
          and tracker land here.
        </li>
      </ol>
    </div>
  );
}

function LinkDetail({
  link,
  onAdvance,
}: {
  link: IntakeLink;
  onAdvance: (status: "review" | "quoted" | "closed") => void;
}) {
  const sub = link.submission;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-wider text-subtle uppercase">
            {link.publicId}
          </p>
          <h2 className="text-lg font-medium text-fg">
            {link.label || "Open intake"}
          </h2>
          <p className="text-xs text-muted">Created {formatWhen(link.createdAt)}</p>
        </div>
        <StatusBadge status={link.status} />
      </div>

      <Tracker status={link.status} />
      <SharePanel link={link} />

      {sub ? (
        <div>
          <h3 className="mb-3 font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            Submitted requirement
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Product" value={sub.product} />
            <Item label="Quantity" value={`${sub.quantity} ${sub.unit}`} />
            <Item label="Terms" value={sub.terms} />
            <Item
              label="Payment"
              value={sub.paymentTerms || "—"}
            />
            <Item
              label="Lift window"
              value={sub.deliveryWindow || "—"}
              wide
            />
            <Item
              label="Business License #"
              value={sub.businessLicense || "—"}
            />
            <Item
              label="Refinery Control # (RCN)"
              value={sub.rcn || "—"}
            />
            <Item label="Spec / notes" value={sub.notes || "—"} wide />
          </dl>
          <p className="mt-4 text-xs text-subtle">
            Opened {formatWhen(link.openedAt)} · Submitted{" "}
            {formatWhen(link.submittedAt)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Waiting on the counterparty. The tracker moves to Opened when they
          load the form.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {link.status === "submitted" ? (
          <Button size="sm" variant="outline" onClick={() => onAdvance("review")}>
            Mark in review
          </Button>
        ) : null}
        {link.status === "review" ? (
          <Button size="sm" variant="outline" onClick={() => onAdvance("quoted")}>
            Mark quoted
          </Button>
        ) : null}
        {link.status !== "closed" ? (
          <Button size="sm" variant="ghost" onClick={() => onAdvance("closed")}>
            Close
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Item({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 text-fg">{value}</dd>
    </div>
  );
}
