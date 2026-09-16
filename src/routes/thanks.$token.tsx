import { createFileRoute, Link } from "@tanstack/react-router";
import { McscMark } from "@/components/mark";
import { Tracker } from "@/components/tracker";
import { getLink } from "@/lib/intake-api";

export const Route = createFileRoute("/thanks/$token")({
  loader: async ({ params }) => {
    try {
      const link = await getLink({ data: { token: params.token } });
      return { link };
    } catch {
      return { link: null };
    }
  },
  component: ThanksPage,
});

function ThanksPage() {
  const { link } = Route.useLoaderData();
  const sub = link?.submission;

  if (!link || !sub) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16">
        <McscMark className="mb-6 size-10 text-primary" />
        <h1 className="text-xl font-medium text-fg">Request not found</h1>
        <p className="mt-2 text-sm text-muted">
          This confirmation link is invalid or the request never landed.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16">
      <McscMark className="mb-6 size-10 text-primary" />
      <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        {link.publicId}
      </p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight text-fg">
        Request received
      </h1>
      <p className="mt-2 text-sm text-muted">
        The desk has your requirement. They will follow up on this link.
      </p>

      <div className="mt-8">
        <Tracker status={link.status} />
      </div>

      <dl className="mt-8 grid gap-3 rounded-xl border border-border bg-surface p-5 text-sm">
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
      </dl>

      <Link
        to="/desk"
        className="mt-8 font-mono text-[11px] tracking-wider text-subtle uppercase hover:text-fg"
      >
        Desk
      </Link>
    </main>
  );
}
