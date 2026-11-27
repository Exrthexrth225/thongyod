# I'm the Boss! — Implementation Summary

Short handoff note for Claude (frontend) and Earth.

## What Was Built
- **Shared board & engine** (`packages/shared/content/boss-board.json`, `boss-engine.mjs`, `boss-engine.d.mts`, `packages/shared/src/boss.ts`, `rooms.ts`, `index.ts`):
  - 16-space clockwise board, 15 deal placards (\$1M–\$6M per dividend; end-game die roll starting at Deal 10, automatic end at Deal 15), 98-card Influence deck (`team`, `travel`, `recruit`, `boss`, `stop`), 12-card hand limit at turn end.
  - Authoritative state machine shared between `apps/api` and `apps/web` demo mocks: `pick_start`, `turn_choice`, `rolled_choice`, `negotiating`, `closing` (10s/15s window), `interrupt` (10s window with odd/even `Stop!` chain), `discard_limit`, and `game_over`.
  - Uneven non-negative integer payouts, `actionId` deduplication, `expectedRevision` conflict check (`409 REVISION_CONFLICT`), lazy server deadline resolution on read/write, and privacy projection (opponents' hands omitted and opponent cash shown only as coarse `cashTier` until `game_over`).
- **Backend (`apps/api`)**:
  - `apps/api/src/social/rooms.service.ts` & `rooms.controller.ts`: Added `boss` game to `/rooms` (6-player cap, Neon PostgreSQL `game_rooms` persistence with `FOR UPDATE` locks), `POST /rooms/:code/boss`, and `GET /rooms/:code/events` (SSE revision stream).
- **Frontend (`apps/web`)**:
  - Sliced the 6 investor portraits from `image/fcde811b-52f5-468f-97aa-b5582e40d0bc.png` into `apps/web/src/assets/boss/{red,orange,yellow,green,blue,purple}.webp`.
  - `apps/web/src/features/boss/`: `BossRoom.tsx`, `BossBoard.tsx`, `BossSeats.tsx`, `BossEventBanner.tsx`, `teamMeta.ts`, `boss.css` (hop marker, dice tumble, LINE Get Rich-style slam/stop/fly banners, confetti, coarse cash stacks, payout splitter, card target dialogs, and `prefers-reduced-motion` support).
  - Wired into `config/games.ts`, `config/howTo.ts`, `components/games/GameTile.tsx` (`mode: 'rooms'`), `pages/RoomsPage.tsx`, `pages/RoomNewPage.tsx`, `pages/RoomPage.tsx`, `api/rooms.ts`, `mocks/rooms.ts` (including demo bots + seeded room `777888`), `mocks/handlers.ts`, and `th.ts`/`en.ts`.
