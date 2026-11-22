CREATE TABLE "game_rooms" (
	"code" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "room_code" CHECK ("game_rooms"."code" ~ '^[0-9]{6}$'),
	CONSTRAINT "room_expiry" CHECK ("game_rooms"."expires_at">"game_rooms"."created_at")
);
--> statement-breakpoint
CREATE TABLE "media_deletes" (
	"url" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rooms_expiry" ON "game_rooms" USING btree ("expires_at");