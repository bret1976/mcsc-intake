import { createFileRoute } from "@tanstack/react-router";
import { Envelope } from "@/components/envelope";
import { IntakeForm } from "@/components/intake-form";
import { McscMark } from "@/components/mark";
import { getLink, openLink } from "@/lib/intake-api";

export const Route = createFileRoute("/r/$token")({
  loader: async ({ params }) => {
    try {
      const opened = await openLink({ data: { token: params.token } });
      if (opened) return { link: opened };
      const link = await getLink({ data: { token: params.token } });
      return { link };
    } catch {
      return { link: null };
    }
  },
  component: FormPage,
});

function FormPage() {
  const { link } = Route.useLoaderData();

  if (!link) {
    return (
      <Gate
        title="Link not found"
        body="This intake link is invalid. Ask the desk to send a new one."
      />
    );
  }

  if (link.submission) {
    return <Envelope initial={link} />;
  }

  if (link.status === "closed") {
    return (
      <Gate
        title="Link closed"
        body="This intake is no longer accepting requests."
      />
    );
  }

  return <IntakeForm link={link} />;
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16">
      <McscMark className="mb-6 size-10 text-primary" />
      <h1 className="text-xl font-medium text-fg">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </main>
  );
}
