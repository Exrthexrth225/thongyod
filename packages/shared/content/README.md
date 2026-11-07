# Shared game content

`room-games.json` holds the words and cards for the games that can be played in multi-phone rooms
(สายลับ places and pairs, ใครน่าจะ…, ไม่เคย…). It is the only copy:

- the web app reads it in `apps/web/src/config/games/spy.ts` and `party.ts` (which add the pack icon and colour);
- the API server deals cards and secrets from it in rooms.

Pack ids are part of the rooms contract (`settings.packs`). Content rules are in the comments at the top of those
two web files and in docs/DECISIONS.md #81. Content is Thai only for now. Edit it here; the web tests check counts
and duplicates.
