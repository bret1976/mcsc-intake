import { cn } from "@/lib/utils";
import { TRACKER_STEPS, trackerIndex, type Status } from "@/lib/catalog";

export function Tracker({ status }: { status: Status }) {
  const current = trackerIndex(status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Request tracker">
      {TRACKER_STEPS.map((step, i) => {
        const done = i <= current;
        const active = i === current;
        return (
          <li key={step.key} className="flex min-w-0 flex-col gap-1.5">
            <span
              className={cn(
                "h-1 rounded-full transition-colors duration-200",
                done ? "bg-primary" : "bg-border-strong",
              )}
            />
            <span
              className={cn(
                "text-center font-mono text-[10px] leading-tight uppercase",
                active ? "text-fg" : done ? "text-muted" : "text-subtle",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
