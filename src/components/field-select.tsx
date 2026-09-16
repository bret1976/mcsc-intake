import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
};

export function FieldSelect({
  id,
  label,
  optional,
  hint,
  value,
  placeholder,
  onChange,
  disabled,
  children,
}: Props) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium tracking-wide text-muted">
        {label}
        {optional ? (
          <span className="font-normal text-subtle"> (optional)</span>
        ) : null}
        {hint ? <span className="font-normal text-subtle"> {hint}</span> : null}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-11 w-full appearance-none rounded-md border border-border bg-input py-0 pr-10 pl-3 text-sm text-fg",
            "transition-[border-color,box-shadow] duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50",
            !value && "text-subtle",
          )}
        >
          <option value="">{placeholder}</option>
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
          strokeWidth={1.75}
        />
      </div>
    </div>
  );
}
