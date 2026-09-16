import { createFileRoute } from "@tanstack/react-router";
import { Desk } from "@/components/desk";
import { listLinks } from "@/lib/intake-api";

export const Route = createFileRoute("/desk")({
  loader: () => listLinks(),
  staleTime: 0,
  shouldReload: true,
  component: DeskPage,
});

function DeskPage() {
  const links = Route.useLoaderData();
  return <Desk initial={links} />;
}
