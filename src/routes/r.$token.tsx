import { createFileRoute } from "@tanstack/react-router";
import { IntakeForm } from "@/components/intake-form";
import { McscMark } from "@/components/mark";
import { isOpenStatus } from "@/lib/catalog";
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

  if (link.status === "closed") {
    return (
      <Gate
        title="Link closed"
        body="This intake is no longer accepting requests."
      />
    );
  }

  if (!isOpenStatus(link.status) && link.submission) {
    return (
      <Gate
        title="Already submitted"
        body={`${link.publicId} is already on the desk. If you need to change it, ask them to send a new link.`}
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
