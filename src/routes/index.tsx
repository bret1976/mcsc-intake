import { createFileRoute } from "@tanstack/react-router";
import { IntakeForm } from "@/components/intake-form";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <IntakeForm showShare />;
}
