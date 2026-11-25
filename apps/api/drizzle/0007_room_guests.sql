CREATE TABLE "game_guest_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "game_guest_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "guest_session_expiry" CHECK ("game_guest_sessions"."expires_at">"game_guest_sessions"."created_at")
);
--> statement-breakpoint
CREATE INDEX "guest_sessions_expiry" ON "game_guest_sessions" USING btree ("expires_at");