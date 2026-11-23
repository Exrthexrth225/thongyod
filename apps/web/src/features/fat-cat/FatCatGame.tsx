import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Gamepad2,
  HandFist,
  History,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  SkipForward,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SegmentedChoice } from "@/components/common/SegmentedChoice";
import { BottomAction } from "@/components/games/BottomAction";
import { HowSteps } from "@/components/games/HowSteps";
import { CircleEditor } from "@/components/games/CircleEditor";
import { FlipCard } from "@/components/games/FlipCard";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BIG_CARDS,
  MINI_GAMES,
  STANDARD_SET,
  type Rank,
  type Rule,
  type RuleSet,
} from "@/config/games/fatCat";
import { markDone } from "@/features/daily/daily";
import { circleStore } from "@/features/games/circle";
import { useGameSettings } from "@/lib/gameSettings";
import { SHOW_BACK } from "@/lib/nav";
import { secureRandomInt } from "@/lib/random";
import { playSound, unlockSound } from "@/lib/sound";
import { useGameSound } from "@/lib/soundPrefs";
import { tintClass } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/lib/wakeLock";
import {
  REVEAL_LOCK_MS,
  SHUFFLE_MS,
  addKingRule,
  addPlayer,
  allAway,
  canDraw,
  cardsLeft,
  clearKingRules,
  copySet,
  current,
  deckEmpty,
  draw,
  faceUp,
  newTable,
  next,
  removePlayer,
  reshuffle,
  reverse,
  setAway,
  shuffled,
  skip,
  undoLast,
  type KMode,
  type Table,
} from "./logic";
import { allSets, setById, setsStore, tableStore } from "./store";
import { CardBack, CardFace } from "./CardArt";
import { isRed, kingBadge, pipArt, queenBadge } from "./cardImages";
import "./fat-cat.css";

const TINT = 3;
const newSetId = () => `g${secureRandomInt(1_000_000_000)}`;
/** The card is as big as its box allows (5:7): the box takes whatever height the status line and controls leave. */
const CARD_SIZE = "aspect-[5/7] w-[min(100cqw,calc(100cqh*5/7))]";

// เกมโดเรม่อน (id fatCat) (#126): a card drawer for the circle. The phone sits in the middle; the card back says whose turn it is,
// a tap turns it over and the card says what to do. The app never picks who drinks and keeps no score. It does
// remember the queen and the king rule, and keeps a history; undo, skip, reverse and AFK are always at hand.
export function FatCatGame() {
  const saved = tableStore.use();
  return saved ? <Board table={saved.table} /> : <Setup />;
}

function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const custom = setsStore.use();
  const [{ setId, decks, kMode }, setSettings] = useGameSettings<{
    setId: string;
    decks: 1 | 2;
    kMode: KMode;
  }>("fatCat", { setId: STANDARD_SET.id, decks: 1, kMode: "replace" });
  const chosen = setById(custom, setId);

  function newSet() {
    const id = newSetId();
    setsStore.set([
      ...custom,
      copySet(
        chosen,
        id,
        t("games.fatCat.sets.newName", { n: custom.length + 1 }),
      ),
    ]);
    setSettings({ setId: id, decks, kMode });
    void navigate(`/games/fat-cat/rules/${id}`, { state: SHOW_BACK });
  }

  function start() {
    unlockSound();
    const names = circleStore.get();
    tableStore.set({
      table: newTable(chosen.id, names, {
        decks,
        kMode,
        first: names.length ? secureRandomInt(names.length) : 0,
      }),
      undo: [],
    });
    markDone("tool");
  }

  return (
    <div className="flex flex-col gap-3 pb-28">
      <HowSteps
        game={"fatCat"}
        steps={(["middle", "open", "paws"] as const).map((step) =>
          t(`games.fatCat.how.${step}`),
        )}
      />

      <SectionHeader title={t("games.circle.section")} />
      <CircleEditor />

      <SectionHeader title={t("games.fatCat.options")} />
      <div className="mx-4 flex flex-col gap-3 rounded-3xl bg-card p-4">
        <SegmentedChoice<"1" | "2">
          label={t("games.fatCat.decks")}
          value={String(decks) as "1" | "2"}
          onChange={(v) =>
            setSettings({ setId, decks: v === "2" ? 2 : 1, kMode })
          }
          options={[
            { value: "1", label: t("games.fatCat.decksOne") },
            { value: "2", label: t("games.fatCat.decksTwo") },
          ]}
        />
        <KModeRow
          value={kMode}
          onChange={(k) => setSettings({ setId, decks, kMode: k })}
        />
      </div>

      <SectionHeader title={t("games.fatCat.sets.title")} />
      <div
        className="mx-4 flex flex-col gap-1.5"
        role="radiogroup"
        aria-label={t("games.fatCat.sets.title")}
      >
        {allSets(custom).map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-1 rounded-2xl border-2 bg-card pr-1",
              s.id === chosen.id ? "border-primary" : "border-transparent",
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={s.id === chosen.id}
              onClick={() => setSettings({ setId: s.id, decks, kMode })}
              className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border-2",
                  s.id === chosen.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40",
                )}
              >
                {s.id === chosen.id && (
                  <Check
                    className="size-3"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {s.id === STANDARD_SET.id
                  ? t("games.fatCat.sets.standard")
                  : s.name}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(
                s.id === STANDARD_SET.id
                  ? "games.fatCat.sets.view"
                  : "games.fatCat.sets.edit",
                { name: s.name },
              )}
              onClick={() =>
                void navigate(`/games/fat-cat/rules/${s.id}`, {
                  state: SHOW_BACK,
                })
              }
            >
              {s.id === STANDARD_SET.id ? <ChevronRight /> : <Pencil />}
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={newSet}>
          <Plus data-icon="inline-start" />
          {t("games.fatCat.sets.new", {
            name:
              chosen.id === STANDARD_SET.id
                ? t("games.fatCat.sets.standard")
                : chosen.name,
          })}
        </Button>
      </div>

      <BottomAction>
        <Button size="lg" className="flex-1" onClick={start}>
          <Play data-icon="inline-start" />
          {t("games.fatCat.start")}
        </Button>
      </BottomAction>
    </div>
  );
}

function KModeRow({
  value,
  onChange,
}: {
  value: KMode;
  onChange: (k: KMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">
          {t("games.fatCat.kStack")}
        </span>
        <span className="block text-xs text-muted-foreground">
          {t("games.fatCat.kStackHint")}
        </span>
      </span>
      <Switch
        checked={value === "stack"}
        onCheckedChange={(on) => onChange(on ? "stack" : "replace")}
      />
    </label>
  );
}

function Board({ table }: { table: Table }) {
  const { t } = useTranslation();
  const sound = useGameSound("fatCat");
  const custom = setsStore.use();
  const set = setById(custom, table.setId);
  const [sheet, setSheet] = useState<"history" | "players" | "edit" | null>(
    null,
  );
  const [locked, setLocked] = useState(false);
  const lockTimer = useRef(0);
  const card = faceUp(table);
  const me = current(table);
  useWakeLock(true);

  const save = (next: Table, undo = tableStore.get()?.undo ?? []) =>
    tableStore.set({ table: next, undo });

  // SHUFFLING lasts SHUFFLE_MS, then the first card waits face down.
  useEffect(() => {
    if (table.phase !== "shuffling") return;
    const id = window.setTimeout(() => {
      const s = tableStore.get();
      if (s) tableStore.set({ ...s, table: shuffled(s.table) });
    }, SHUFFLE_MS);
    return () => window.clearTimeout(id);
  }, [table.phase, table.deck]);
  useEffect(() => () => window.clearTimeout(lockTimer.current), []);

  function tap(e: { timeStamp: number }) {
    const s = tableStore.get();
    if (!s || locked) return;
    if (s.table.phase === "down" && canDraw(s.table)) {
      unlockSound();
      const r = draw(
        s.table,
        s.undo,
        set,
        Math.round(performance.timeOrigin + e.timeStamp),
      );
      tableStore.set(r);
      const drawn = faceUp(r.table)!;
      navigator.vibrate?.(BIG_CARDS.includes(drawn.rank) ? [100, 50, 100] : 50);
      if (sound) playSound("flip");
      // FACE_UP: ignore taps for a second so a double tap cannot skip the card.
      setLocked(true);
      window.clearTimeout(lockTimer.current);
      lockTimer.current = window.setTimeout(
        () => setLocked(false),
        REVEAL_LOCK_MS,
      );
    } else if (s.table.phase === "up") {
      save(next(s.table));
    }
  }
  function onUndo() {
    const s = tableStore.get();
    if (!s) return;
    window.clearTimeout(lockTimer.current);
    setLocked(false);
    tableStore.set(undoLast(s.table, s.undo));
  }
  function onSkip() {
    const s = tableStore.get();
    if (s) tableStore.set(skip(s.table, s.undo));
  }

  const empty = deckEmpty(table);
  const away = allAway(table);
  const undoCount = tableStore.get()?.undo.length ?? 0;

  const isQueen = !!me && me.name === table.queen;
  const back = (
    <CardBack
      above={me ? t("games.fatCat.turnOf") : undefined}
      below={t("games.fatCat.tapToOpen")}
    >
      {isQueen && (
        <img
          src={queenBadge}
          alt={t("games.fatCat.queenBadge")}
          className="size-[11cqh] shrink-0"
        />
      )}
      <span className="line-clamp-1 min-w-0 font-heading text-[clamp(24px,9cqw,40px)] leading-tight font-extrabold break-words">
        {me ? me.name : t("games.fatCat.turnAnyone")}
      </span>
    </CardBack>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          aria-label={t("games.fatCat.history")}
          onClick={() => setSheet("history")}
        >
          <History />
        </Button>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          <StatusChip
            icon={HandFist}
            text={set.always}
            className="bg-ink text-ink-foreground"
          />
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
          {t("games.fatCat.left", { n: cardsLeft(table) })}
        </span>
      </div>

      {(table.queen || table.kRules.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {table.queen && (
            <RoyalRow
              badge={queenBadge}
              label={t("games.fatCat.status.queenOf", { name: table.queen })}
              text={t("games.fatCat.status.queenRule")}
              className={tintClass(6)}
            />
          )}
          {table.kRules.map((r, i) => (
            <RoyalRow
              key={i}
              badge={kingBadge}
              label={t("games.fatCat.status.kingRule")}
              text={r}
              className={tintClass(4)}
            />
          ))}
        </div>
      )}

      <div className="relative grid min-h-0 flex-1 place-items-center [container-type:size]">
        {table.phase === "shuffling" ? (
          <span
            className={cn("relative block", CARD_SIZE)}
            aria-label={t("games.fatCat.shuffling")}
            role="img"
          >
            {[0, 1, 2].map((i) => (
              <span key={i} className="fat-shuffle-card absolute inset-0">
                {back}
              </span>
            ))}
          </span>
        ) : empty ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-[1.4rem] p-6 text-center",
              CARD_SIZE,
              tintClass(TINT),
            )}
          >
            <Shuffle className="size-12" aria-hidden="true" />
            <p className="font-heading text-2xl font-bold">
              {t("games.fatCat.deckDone")}
            </p>
            <p className="text-sm opacity-85">
              {t("games.fatCat.deckDoneHint")}
            </p>
            <Button size="lg" onClick={() => save(reshuffle(table))}>
              <Shuffle data-icon="inline-start" />
              {t("games.fatCat.reshuffle")}
            </Button>
          </div>
        ) : away ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-[1.4rem] bg-card p-6 text-center",
              CARD_SIZE,
            )}
          >
            <Users className="size-12" aria-hidden="true" />
            <p className="font-heading text-xl font-bold">
              {t("games.fatCat.allAway")}
            </p>
            <Button onClick={() => setSheet("players")}>
              {t("games.fatCat.players")}
            </Button>
          </div>
        ) : (
          <button
            // Same key face down and face up, so the card turns over instead of being replaced.
            key={`c${card ? table.drawn - 1 : table.drawn}`}
            type="button"
            onClick={tap}
            aria-label={
              card
                ? `${t("games.fatCat.cardLabel", { rank: card.rank, suit: t(`games.fatCat.suits.${card.suit}`), title: set.rules[card.rank].title })}. ${t("games.fatCat.tapNext")}`
                : t("games.fatCat.tapToOpenWho", { name: me?.name ?? "" })
            }
            className={cn("relative block", CARD_SIZE, !card && "fat-deal")}
          >
            <FlipCard
              flipped={!!card}
              front={back}
              back={
                card ? (
                  <CardFace card={card} rule={set.rules[card.rank]} />
                ) : (
                  <span />
                )
              }
              className="fat-flip size-full"
            />
          </button>
        )}
        {card && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-2 right-0"
            aria-label={t("games.fatCat.editCard", { rank: card.rank })}
            onClick={() => setSheet("edit")}
          >
            <Pencil />
          </Button>
        )}
      </div>

      {card?.rank === "K" && (
        <KingInput
          key={table.drawn}
          table={table}
          onSave={(rule) => save(addKingRule(table, rule))}
        />
      )}
      {card?.rank === "9" && (
        <div className="grid grid-cols-4 gap-1.5">
          {MINI_GAMES.map((g) => (
            <Link
              key={g.id}
              to={g.to}
              state={SHOW_BACK}
              className="pressable flex flex-col items-center gap-0.5 rounded-2xl bg-card px-1 py-2 text-center text-xs font-semibold"
            >
              <Gamepad2 className="size-4" aria-hidden="true" />
              {t(`games.list.${g.id}.title`)}
            </Link>
          ))}
        </div>
      )}
      <p
        className="min-h-5 text-center text-sm text-muted-foreground"
        aria-live="polite"
      >
        {table.phase === "up"
          ? locked
            ? t("games.fatCat.wait")
            : t("games.fatCat.tapNext")
          : ""}
      </p>

      <div className="grid grid-cols-4 gap-2">
        <ControlButton
          icon={RotateCcw}
          label={t("games.fatCat.undo")}
          disabled={!undoCount}
          onClick={onUndo}
        />
        <ControlButton
          icon={SkipForward}
          label={t("games.fatCat.skip")}
          disabled={
            table.players.length < 2 || away || table.phase === "shuffling"
          }
          onClick={onSkip}
        />
        <ControlButton
          icon={ArrowLeftRight}
          label={t(
            table.dir === 1 ? "games.fatCat.dirLeft" : "games.fatCat.dirRight",
          )}
          pressed={table.dir === -1}
          onClick={() => save(reverse(table))}
        />
        <ControlButton
          icon={Users}
          label={t("games.fatCat.players")}
          onClick={() => setSheet("players")}
        />
      </div>

      <HistorySheet
        open={sheet === "history"}
        onOpenChange={(o) => setSheet(o ? "history" : null)}
        table={table}
      />
      <PlayersSheet
        open={sheet === "players"}
        onOpenChange={(o) => setSheet(o ? "players" : null)}
        table={table}
        onChange={(n) => save(n)}
      />
      {card && (
        <EditCardSheet
          key={`${table.drawn}-${sheet === "edit"}`}
          open={sheet === "edit"}
          onOpenChange={(o) => setSheet(o ? "edit" : null)}
          rank={card.rank}
          set={set}
          onSwitchSet={(id) => save({ ...table, setId: id })}
        />
      )}
    </div>
  );
}

function KingInput({
  table,
  onSave,
}: {
  table: Table;
  onSave: (rule: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p className="text-center text-sm font-semibold">
        {t("games.fatCat.kingSaved")}
      </p>
    );
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onSave(draft);
        setDone(true);
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={120}
        placeholder={t(
          table.kMode === "stack"
            ? "games.fatCat.kingAdd"
            : "games.fatCat.kingNew",
        )}
        aria-label={t("games.fatCat.kingNew")}
        enterKeyHint="done"
      />
      <Button type="submit" disabled={!draft.trim()}>
        {t("games.fatCat.kingSave")}
      </Button>
    </form>
  );
}

function StatusChip({
  icon: Icon,
  text,
  className,
}: {
  icon: LucideIcon;
  text: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

/** Queen and king rules stay big on top of the table (#129): the badge, who or what, and the rule in full. */
function RoyalRow({
  badge,
  label,
  text,
  className,
}: {
  badge: string;
  label: string;
  text: string;
  className: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-2xl py-1.5 pr-3 pl-1.5 [@media(max-height:700px)]:py-1",
        className,
      )}
    >
      <img
        src={badge}
        alt=""
        className="size-10 shrink-0 [@media(max-height:700px)]:size-7"
      />
      <p className="min-w-0 flex-1 leading-tight">
        <span className="block font-heading text-[15px] font-bold">
          {label}
        </span>
        <span className="line-clamp-2 text-[13px] [@media(max-height:700px)]:line-clamp-1">
          {text}
        </span>
      </p>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  pressed,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "pressable flex flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-semibold disabled:opacity-40",
        pressed ? "bg-ink text-ink-foreground" : "bg-card",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </button>
  );
}

function HistorySheet({
  open,
  onOpenChange,
  table,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: Table;
}) {
  const { t, i18n } = useTranslation();
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const rows = [...table.history].reverse();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("games.fatCat.history")}
    >
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("games.fatCat.historyEmpty")}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {rows.map((d) => {
              return (
                <li
                  key={d.turn}
                  className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2"
                >
                  <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {d.turn}
                  </span>
                  <span
                    className={cn(
                      "flex w-12 shrink-0 items-center justify-center gap-0.5 rounded-lg bg-white py-1 font-heading font-bold",
                      isRed(d.card.suit) ? "text-[#c8232c]" : "text-[#2a1f1d]",
                    )}
                  >
                    {d.card.rank}
                    <img
                      src={pipArt(d.card.suit)}
                      className="size-4"
                      alt={t(`games.fatCat.suits.${d.card.suit}`)}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {d.player ?? t("games.fatCat.someone")}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {d.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {time.format(d.at)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </BottomSheet>
  );
}

function PlayersSheet({
  open,
  onOpenChange,
  table,
  onChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: Table;
  onChange: (t: Table) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const me = current(table);
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("games.fatCat.players")}
    >
      <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <p className="text-sm text-muted-foreground">
          {t("games.fatCat.playersHint")}
        </p>
        {table.players.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {table.players.map((p) => (
              <li
                key={p.name}
                className={cn(
                  "flex items-center gap-3 rounded-2xl bg-card px-3 py-2",
                  p.afk && "opacity-60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  {me?.name === p.name && !p.afk && (
                    <span className="text-xs font-semibold text-primary">
                      {t("games.fatCat.nowTurn")}
                    </span>
                  )}
                </span>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  {t("games.fatCat.afk")}
                  <Switch
                    checked={p.afk}
                    onCheckedChange={(on) =>
                      onChange(setAway(table, p.name, on))
                    }
                    aria-label={t("games.fatCat.afkOf", { name: p.name })}
                  />
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("games.circle.remove", { name: p.name })}
                  onClick={() => onChange(removePlayer(table, p.name))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onChange(addPlayer(table, draft));
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={20}
            placeholder={t("games.fatCat.addPlayer")}
            aria-label={t("games.fatCat.addPlayer")}
            enterKeyHint="done"
          />
          <Button
            type="submit"
            disabled={!draft.trim()}
            aria-label={t("games.circle.add")}
          >
            <Plus />
          </Button>
        </form>
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-3">
          <KModeRow
            value={table.kMode}
            onChange={(k) => onChange({ ...table, kMode: k })}
          />
          {table.kRules.length > 0 && (
            <Button
              variant="outline"
              onClick={() => onChange(clearKingRules(table))}
            >
              {t("games.fatCat.kingClear")}
            </Button>
          )}
        </div>
        <Button variant="ghost" onClick={() => tableStore.set(null)}>
          <X data-icon="inline-start" />
          {t("games.fatCat.end")}
        </Button>
      </div>
    </BottomSheet>
  );
}

/** Change what the open card says, mid-game (live edit). The standard set is copied into the gang's own set first. */
function EditCardSheet({
  open,
  onOpenChange,
  rank,
  set,
  onSwitchSet,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rank: Rank;
  set: RuleSet;
  onSwitchSet: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [rule, setRule] = useState<Rule>(set.rules[rank]);
  function save() {
    const custom = setsStore.get();
    const edited = {
      title: rule.title.trim() || set.rules[rank].title,
      text: rule.text.trim(),
    };
    if (set.id === STANDARD_SET.id) {
      const id = newSetId();
      const copy = copySet(
        set,
        id,
        t("games.fatCat.sets.newName", { n: custom.length + 1 }),
      );
      setsStore.set([
        ...custom,
        { ...copy, rules: { ...copy.rules, [rank]: edited } },
      ]);
      onSwitchSet(id);
    } else {
      setsStore.set(
        custom.map((s) =>
          s.id === set.id ? { ...s, rules: { ...s.rules, [rank]: edited } } : s,
        ),
      );
    }
    onOpenChange(false);
  }
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("games.fatCat.editCard", { rank })}
    >
      <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {set.id === STANDARD_SET.id && (
          <p className="text-sm text-muted-foreground">
            {t("games.fatCat.editCopies")}
          </p>
        )}
        <Input
          value={rule.title}
          maxLength={24}
          onChange={(e) => setRule({ ...rule, title: e.target.value })}
          aria-label={t("games.fatCat.sets.cardTitle", { rank })}
        />
        <textarea
          value={rule.text}
          maxLength={200}
          rows={3}
          onChange={(e) => setRule({ ...rule, text: e.target.value })}
          aria-label={t("games.fatCat.sets.cardText", { rank })}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        <Button size="lg" onClick={save}>
          {t("games.fatCat.sets.save")}
        </Button>
      </div>
    </BottomSheet>
  );
}
