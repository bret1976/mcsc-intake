import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldSelect } from "@/components/field-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TERMS } from "@/lib/catalog";
import { sendQuote, type IntakeLink } from "@/lib/intake-api";
import { formatWhen } from "@/lib/utils";

export function QuotePanel({
  link,
  onQuoted,
}: {
  link: IntakeLink;
  onQuoted: (link: IntakeLink) => void;
}) {
  const existing = link.quote;
  const [price, setPrice] = useState(existing?.price ?? "");
  const [validity, setValidity] = useState(existing?.validity ?? "");
  const [incoterms, setIncoterms] = useState(
    existing?.incoterms || link.submission?.terms || "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!price.trim() || !validity.trim() || !incoterms) {
      setError("Price, validity, and Incoterms are required.");
      return;
    }
    setBusy(true);
    try {
      const updated = await sendQuote({
        data: {
          token: link.token,
          price: price.trim(),
          validity: validity.trim(),
          incoterms: incoterms as (typeof TERMS)[number],
          notes: notes.trim(),
        },
      });
      onQuoted(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send quote.");
    } finally {
      setBusy(false);
    }
  }

  if (!link.submission) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <p className="mb-1 text-sm font-medium text-fg">
        {existing ? "Update quote" : "Quote this envelope"}
      </p>
      <p className="mb-4 text-xs text-muted">
        They open the same link and see this. No new send.
        {existing?.quotedAt
          ? ` Last sent ${formatWhen(existing.quotedAt)}.`
          : ""}
      </p>
      <form onSubmit={onSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor="quote-price" className="text-xs font-medium tracking-wide text-muted">
            Price
          </label>
          <Input
            id="quote-price"
            value={price}
            placeholder="e.g. WTI + 2.15 or $82.40 / BBL"
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="quote-valid" className="text-xs font-medium tracking-wide text-muted">
            Valid until
          </label>
          <Input
            id="quote-valid"
            value={validity}
            placeholder="e.g. 17:00 UTC 19 Sep"
            onChange={(e) => setValidity(e.target.value)}
          />
        </div>
        <FieldSelect
          id="quote-incoterms"
          label="Incoterms"
          value={incoterms}
          placeholder="Select Incoterms"
          onChange={setIncoterms}
        >
          {TERMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </FieldSelect>
        <div className="grid gap-1.5">
          <label htmlFor="quote-notes" className="text-xs font-medium tracking-wide text-muted">
            Note <span className="font-normal text-subtle">(optional)</span>
          </label>
          <Textarea
            id="quote-notes"
            value={notes}
            placeholder="Laycan, quality, subject to…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : existing ? "Update quote" : "Send quote"}
        </Button>
      </form>
    </div>
  );
}
