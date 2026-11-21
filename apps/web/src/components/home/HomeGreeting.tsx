import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Bell, Flame, ScanLine } from "lucide-react";
import { Egg } from "@/components/pet/Egg";
import { Pet } from "@/components/pet/Pet";
import type { PetSpeciesId } from "@/components/pet/species";
import { buttonVariants } from "@/components/ui/button";
import { CountBadge } from "@/components/common/CountBadge";
import { useUnreadNotifications } from "@/api/notifications";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/common/Badge";
import { NotificationsSheet } from "@/components/notifications/NotificationsSheet";
import { ScanDialog } from "@/components/scan/ScanDialog";

type Props = {
  name: string | null;
  species: PetSpeciesId | null;
  streak: number;
  onPetTap: () => void;
  now: Date;
  /** First Home visit of the day: the slab drops in and the pet jumps in (#98). */
  intro?: boolean;
};

function dayPart(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function greetingKey(hour: number) {
  return `home.greeting.${dayPart(hour)}` as const;
}

// Top of Home: a yolk slab with a greeting, my big name, my pet (always moving, tap to play) and what it says,
// the streak, the QR scanner (#82) and notifications.
// Scrolled past it, a slim bar stays on top with the name, streak and bell (#75). The bell opens a bottom sheet.
export function HomeGreeting({ name, species, streak, onPetTap, now, intro = false }: Props) {
  const { t } = useTranslation();
  const unread = useUnreadNotifications();
  const [sheet, setSheet] = useState(false);
  const [scan, setScan] = useState(false);
  const [compact, setCompact] = useState(false);
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-40px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bell = (
    <button
      type="button"
      onClick={() => setSheet(true)}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "relative rounded-full bg-card",
      )}
      aria-label={
        unread > 0
          ? `${t("common.notifications")} (${unread} ${t("notifications.unread")})`
          : t("common.notifications")
      }
    >
      <Bell />
      <CountBadge count={unread} className="top-1.5 right-1" />
    </button>
  );
  const scanButton = (
    <button
      type="button"
      onClick={() => setScan(true)}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full bg-card")}
      aria-label={t("scan.open")}
    >
      <ScanLine />
    </button>
  );
  const streakBadge = streak >= 2 && (
    <span title={t("home.streakHint")}>
      <Badge tone="warning" icon={Flame}>
        {t("home.streak", { count: streak })}
      </Badge>
    </span>
  );

  return (
    <>
      <div
        aria-hidden={!compact}
        inert={!compact}
        className={cn(
          "fixed inset-x-0 top-0 z-20 mx-auto flex max-w-md items-center gap-2 border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur transition-[translate,opacity] duration-300 ease-out",
          compact
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-full opacity-0",
        )}
      >
        <p className="min-w-0 flex-1 truncate py-3 text-base font-medium">
          {name ?? " "}
        </p>
        {streakBadge}
        {scanButton}
        {bell}
      </div>
      <NotificationsSheet open={sheet} onOpenChange={setSheet} />
      <ScanDialog open={scan} onOpenChange={setScan} />
      {/* Yolk slab (#97): big name, the pet large on the right, and what the pet says pointing at it. */}
      <header
        ref={header}
        className={cn("on-slab relative overflow-hidden rounded-b-[36px] bg-yolk px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]", intro && "intro-drop")}
      >
        <div className="flex items-center justify-end gap-2">
          {streakBadge}
          {scanButton}
          {bell}
        </div>
        <div className="flex items-end gap-1">
          <div className="flex min-w-0 flex-1 flex-col items-start pb-5">
            <p className="text-base font-medium text-muted-foreground">{t(greetingKey(now.getHours()))}</p>
            <h1 className="w-full truncate text-[clamp(2.4rem,13vw,3.4rem)] leading-[1.1] font-extrabold">{name ?? " "}</h1>
            <p className="relative mt-3 rounded-2xl bg-ink px-3 py-2 text-sm text-pretty text-ink-foreground">
              {species
                ? t(`home.petSays.${dayPart(now.getHours())}`, { name: t(`pet.species.${species}`) })
                : t("home.petSays.egg")}
              {/* Tail pointing at the pet */}
              <span aria-hidden="true" className="absolute top-1/2 -right-1.5 size-3.5 -translate-y-1/2 rotate-45 rounded-[3px] bg-ink" />
            </p>
          </div>
          {species ? (
            <Pet species={species} size={190} onTap={onPetTap} className={cn("-mr-6 -mb-3 -ml-6 shrink-0", intro && "intro-pet")} />
          ) : (
            <Link to="/welcome?step=egg" aria-label={t("pet.hatchNow")} className="mr-4 mb-6 shrink-0">
              <Egg style="mystery" className="h-24" />
            </Link>
          )}
        </div>
      </header>
    </>
  );
}
