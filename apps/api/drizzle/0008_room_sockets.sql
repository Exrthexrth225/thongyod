CREATE TABLE "game_room_actions" (
	"room_code" text NOT NULL,
	"action_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_room_actions_room_code_action_id_pk" PRIMARY KEY("room_code","action_id")
);
--> statement-breakpoint
CREATE TABLE "game_room_boards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_room_boards_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "room_board_status" CHECK ("game_room_boards"."status" in ('pending','approved','rejected','revoked')),
	CONSTRAINT "room_board_label" CHECK ("game_room_boards"."label" ~ '^[A-Z0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "game_rooms" ADD COLUMN "revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rooms" ADD COLUMN "next_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_room_actions" ADD CONSTRAINT "game_room_actions_room_code_game_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."game_rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_room_boards" ADD CONSTRAINT "game_room_boards_room_code_game_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."game_rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_boards_room" ON "game_room_boards" USING btree ("room_code");--> statement-breakpoint
CREATE INDEX "rooms_next_deadline" ON "game_rooms" USING btree ("next_deadline");