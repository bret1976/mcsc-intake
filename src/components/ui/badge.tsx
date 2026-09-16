import { cn } from "@/lib/utils";
import type { Status } from "@/lib/catalog";
import { STATUS_LABEL } from "@/lib/catalog";

const TONE: Record<Status, string> = {
  sent: "border-border text-muted",
  opened: "border-border-strong text-fg",
  submitted: "border-primary/40 text-primary",
  review: "border-warn/40 text-warn",
  quoted: "border-primary/40 text-primary",
  closed: "border-border text-subtle",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 font-mono text-[11px] tracking-wide uppercase",
        TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
