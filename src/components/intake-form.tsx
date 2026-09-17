import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { McscMark } from "@/components/mark";
import { CopyFormLink } from "@/components/copy-form-link";
import { Button } from "@/components/ui/button";
import { FieldSelect } from "@/components/field-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_TERMS, PRODUCTS, TERMS, UNITS } from "@/lib/catalog";
import { submitIntake, submitOpen, type IntakeLink } from "@/lib/intake-api";
import { Tracker } from "@/components/tracker";

type Props = {
  link?: IntakeLink;
  showShare?: boolean;
};

export function IntakeForm({ link, showShare = false }: Props) {
  const navigate = useNavigate();
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [terms, setTerms] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryWindow, setDeliveryWindow] = useState("");
  const [businessLicense, setBusinessLicense] = useState("");
  const [rcn, setRcn] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!product || !quantity.trim() || !unit || !terms) {
      setError("Product, quantity, unit, and terms are required.");
      return;
    }
    setBusy(true);
    const payload = {
      product: product as (typeof PRODUCTS)[number],
      quantity: quantity.trim(),
      unit: unit as (typeof UNITS)[number],
      terms: terms as (typeof TERMS)[number],
      paymentTerms: paymentTerms as (typeof PAYMENT_TERMS)[number] | "",
      deliveryWindow: deliveryWindow.trim(),
      businessLicense: businessLicense.trim(),
      rcn: rcn.trim(),
      notes: notes.trim(),
    };
    try {
      const saved = link
        ? await submitIntake({ data: { token: link.token, ...payload } })
        : await submitOpen({ data: payload });
      await navigate({ to: "/thanks/$token", params: { token: saved.token } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <McscMark className="size-9 text-primary" />
          <div>
            <p className="font-medium tracking-wide text-fg">MCSC</p>
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
              Commodity intake
            </p>
          </div>
        </div>
        {showShare ? (
          <Link
            to="/desk"
            className="font-mono text-[11px] tracking-wider text-subtle uppercase hover:text-fg"
          >
            Desk
          </Link>
        ) : null}
      </header>

      {showShare ? (
        <div className="mb-6 rounded-lg border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs text-muted">
            New private link for this send. One recipient. One filing. Not reused.
          </p>
          <CopyFormLink compact />
        </div>
      ) : null}

      <div className="mb-6">
        <Tracker status={link?.status ?? "opened"} />
      </div>

      {link?.label ? (
        <p className="mb-5 text-sm text-muted">
          Request for <span className="text-fg">{link.label}</span>
          <span className="font-mono text-subtle"> · {link.publicId}</span>
        </p>
      ) : link ? (
        <p className="mb-5 font-mono text-xs tracking-wide text-subtle uppercase">
          {link.publicId}
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border bg-surface p-5 shadow-panel sm:p-6"
      >
        <h1 className="mb-5 font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
          Product requirement
        </h1>

        <div className="grid gap-4">
          <FieldSelect
            id="product"
            label="Product required"
            value={product}
            placeholder="Select product"
            onChange={setProduct}
          >
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </FieldSelect>

          <div className="grid gap-1.5">
            <label htmlFor="quantity" className="text-xs font-medium tracking-wide text-muted">
              Quantity
            </label>
            <Input
              id="quantity"
              inputMode="decimal"
              autoComplete="off"
              placeholder="10000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <FieldSelect
            id="unit"
            label="Unit of measure"
            value={unit}
            placeholder="Select unit"
            onChange={setUnit}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </FieldSelect>

          <FieldSelect
            id="terms"
            label="Terms"
            value={terms}
            placeholder="Select terms"
            onChange={setTerms}
          >
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </FieldSelect>

          <FieldSelect
            id="payment"
            label="Payment terms"
            optional
            value={paymentTerms}
            placeholder="Select if known"
            onChange={setPaymentTerms}
          >
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </FieldSelect>

          <div className="grid gap-1.5">
            <label htmlFor="window" className="text-xs font-medium tracking-wide text-muted">
              Delivery / lift window{" "}
              <span className="font-normal text-subtle">(optional)</span>
            </label>
            <Input
              id="window"
              autoComplete="off"
              placeholder="e.g. Oct 2026 or 15–25 Oct"
              value={deliveryWindow}
              onChange={(e) => setDeliveryWindow(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="license" className="text-xs font-medium tracking-wide text-muted">
              Business License #{" "}
              <span className="font-normal text-subtle">(optional)</span>
            </label>
            <Input
              id="license"
              autoComplete="off"
              placeholder="License number"
              value={businessLicense}
              onChange={(e) => setBusinessLicense(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="rcn" className="text-xs font-medium tracking-wide text-muted">
              Refinery Control #{" "}
              <span className="font-normal text-subtle">(optional — RCN, if applicable)</span>
            </label>
            <Input
              id="rcn"
              autoComplete="off"
              placeholder="RCN number"
              value={rcn}
              onChange={(e) => setRcn(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="notes" className="text-xs font-medium tracking-wide text-muted">
              Notes / spec{" "}
              <span className="font-normal text-subtle">
                (optional — grade, sulfur, location, pipeline)
              </span>
            </label>
            <Textarea
              id="notes"
              placeholder="API gravity, sulfur %, delivery point, pipeline, laycan…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="mt-6 w-full" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
      </form>
    </div>
  );
}
