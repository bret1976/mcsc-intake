import { useEffect, useState } from "react";
import { McscMark } from "@/components/mark";
import { Tracker } from "@/components/tracker";
import { getLink, type IntakeLink } from "@/lib/intake-api";

export function Envelope({
  initial,
  poll = true,
}: {
  initial: IntakeLink;
  poll?: boolean;
}) {
  const [link, setLink] = useState(initial);

  useEffect(() => {
    setLink(initial);
  }, [initial]);

  useEffect(() => {
    if (!poll) return;
    let alive = true;
    const tick = async () => {
      try {
        const next = await getLink({ data: { token: initial.token } });
        if (alive && next) setLink(next);
      } catch {
        /* keep current */
      }
    };
    const id = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [poll, initial.token]);

  const sub = link.submission;
  const quote = link.quote;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16">
      <McscMark className="mb-6 size-10 text-primary" />
      <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        {link.publicId}
      </p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight text-fg">
        {quote ? "Quote on this envelope" : "Request received"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {quote
          ? "The desk put a quote on this same link. Nothing else to fill."
          : "The desk has your requirement. Keep this page — the quote lands here."}
      </p>

      <div className="mt-8">
        <Tracker status={link.status} />
      </div>

      {quote ? (
        <div className="mt-8 rounded-xl border border-primary/40 bg-surface p-5">
          <p className="mb-4 font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
            Desk quote
          </p>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-subtle">Price</dt>
              <dd className="text-lg font-medium text-fg">{quote.price}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-subtle">Valid until</dt>
                <dd className="text-fg">{quote.validity}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Incoterms</dt>
                <dd className="text-fg">{quote.incoterms}</dd>
              </div>
            </div>
            {quote.notes ? (
              <div>
                <dt className="text-xs text-subtle">Note</dt>
                <dd className="text-fg">{quote.notes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Waiting on the desk. When they send a quote, it shows up here. Same
          link. No new envelope.
        </p>
      )}

      {sub ? (
        <dl className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-5 text-sm">
          <div>
            <dt className="text-xs text-subtle">Product</dt>
            <dd className="text-fg">{sub.product}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Quantity</dt>
            <dd className="text-fg">
              {sub.quantity} {sub.unit} · {sub.terms}
            </dd>
          </div>
          {sub.deliveryWindow ? (
            <div>
              <dt className="text-xs text-subtle">Lift window</dt>
              <dd className="text-fg">{sub.deliveryWindow}</dd>
            </div>
          ) : null}
          {sub.paymentTerms ? (
            <div>
              <dt className="text-xs text-subtle">Payment</dt>
              <dd className="text-fg">{sub.paymentTerms}</dd>
            </div>
          ) : null}
          {sub.businessLicense ? (
            <div>
              <dt className="text-xs text-subtle">Business License #</dt>
              <dd className="text-fg">{sub.businessLicense}</dd>
            </div>
          ) : null}
          {sub.rcn ? (
            <div>
              <dt className="text-xs text-subtle">Refinery Control # (RCN)</dt>
              <dd className="text-fg">{sub.rcn}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </main>
  );
}
