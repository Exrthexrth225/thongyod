import { Check, type LucideIcon } from "lucide-react";
import { tintClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { PackIcon } from "./PackIcon";

export type PackOption = {
  id: string;
  icon: LucideIcon;
  tint: number;
  name: string;
  hint?: string;
  meta?: string;
};

type PackPickerProps = {
  packs: PackOption[];
  /** Selected ids. One id when `multiple` is off. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Pick several packs (at least one stays selected). */
  multiple?: boolean;
  label: string;
};

// Content packs as tiles (heads-up, party games, spy, taboo …). #127: one way to show "chosen" across the app:
// not chosen = a white tile with the pack's sticker; chosen = filled with the pack's colour, a white gap and a dark ring,
// and a check.
export function PackPicker({
  packs,
  value,
  onChange,
  multiple,
  label,
}: PackPickerProps) {
  function toggle(id: string) {
    if (!multiple) return onChange([id]);
    const on = value.includes(id);
    if (on && value.length === 1) return;
    onChange(on ? value.filter((v) => v !== id) : [...value, id]);
  }
  return (
    <div
      className="grid grid-cols-2 gap-2 px-4"
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
    >
      {packs.map((pack) => {
        const selected = value.includes(pack.id);
        return (
          <button
            key={pack.id}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={selected}
            onClick={() => toggle(pack.id)}
            className={cn(
              "relative flex min-h-24 flex-col items-start gap-1 rounded-2xl p-3 text-left transition-[transform,box-shadow,background-color] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98]",
              selected
                ? cn(
                    tintClass(pack.tint),
                    "shadow-[0_0_0_3px_var(--background),0_0_0_5px_var(--foreground)]",
                  )
                : "bg-card text-foreground",
            )}
          >
            {selected && (
              <span
                className="absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full bg-foreground text-background"
                aria-hidden="true"
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
            <PackIcon id={pack.id} icon={pack.icon} />
            <span className="mt-1 text-sm font-semibold">{pack.name}</span>
            {pack.hint && (
              <span
                className={cn(
                  "text-xs",
                  selected ? "opacity-85" : "text-muted-foreground",
                )}
              >
                {pack.hint}
              </span>
            )}
            {pack.meta && (
              <span
                className={cn(
                  "mt-auto text-xs font-medium",
                  selected ? "opacity-85" : "text-muted-foreground",
                )}
              >
                {pack.meta}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
