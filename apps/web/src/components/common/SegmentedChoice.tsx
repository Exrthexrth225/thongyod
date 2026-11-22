import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; icon?: LucideIcon };

type SegmentedChoiceProps<T extends string> = {
  options: Option<T>[];
  /** null = nothing chosen yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name of the group, e.g. "เลือกธีม". */
  label: string;
  disabled?: boolean;
};

// One track with equal-width options; the chosen one is filled (#127: one look for every "pick one of 2-4" control:
// game settings, theme, language, meetup answers). Neutral until chosen; colour comes from the content around it.
export function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: SegmentedChoiceProps<T>) {
  return (
    <div
      className={cn(
        "flex gap-1 rounded-full bg-muted p-1",
        disabled && "opacity-50",
      )}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const on = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm transition-[background-color,color] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed",
              on
                ? "bg-primary font-semibold text-primary-foreground"
                : "font-medium text-muted-foreground active:bg-background/60",
            )}
          >
            {option.icon && (
              <option.icon className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
