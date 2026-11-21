ALTER TABLE "users" DROP CONSTRAINT "users_display_name_key_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cover_url" text;--> statement-breakpoint
-- Existing accounts keep their IDs, names, relationships, and sessions.
-- Numbering by primary key gives every pre-existing account a distinct valid handle.
WITH numbered_users AS (
  SELECT "id", 'user_' || row_number() OVER (ORDER BY "id")::text AS "handle"
  FROM "users"
)
UPDATE "users" SET "handle" = numbered_users."handle"
FROM numbered_users WHERE "users"."id" = numbered_users."id";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "handle" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_unique" UNIQUE("handle");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_format" CHECK ("users"."handle" COLLATE "C" ~ '^[a-z][a-z0-9._]{3,19}$');
