import { gameById, type GameId } from "@/config/games";
import { softTintClass } from "@/lib/tones";
import { cn } from "@/lib/utils";

// How a game is played, at the top of its setup (#127): a pale wash of the game's colour with its sticker, so the
// page starts in the game's colour like its tile does, and the numbered steps.
export function HowSteps({
  game,
  steps,
  className,
}: {
  game: GameId;
  steps: string[];
  className?: string;
}) {
  const g = gameById(game);
  return (
    <div
      className={cn(
        "mx-4 flex items-start gap-3 rounded-3xl p-4",
        softTintClass(g.tint),
        className,
      )}
    >
      <ol className="grid min-w-0 flex-1 gap-2 text-sm">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {g.art ? (
        <img
          src={g.art}
          alt=""
          draggable={false}
          className="size-16 shrink-0"
        />
      ) : (
        <g.icon className="size-12 shrink-0 opacity-80" aria-hidden="true" />
      )}
    </div>
  );
}
