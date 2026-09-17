import { createFileRoute } from "@tanstack/react-router";
import { Envelope } from "@/components/envelope";
import { McscMark } from "@/components/mark";
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

  if (!link || !link.submission) {
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

  return <Envelope initial={link} />;
}
