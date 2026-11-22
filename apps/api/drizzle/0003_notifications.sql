CREATE TABLE "app_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"friend_request_id" uuid,
	"meetup_id" uuid,
	"room_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_kind" CHECK ("app_notifications"."kind" in ('friend_request','friend_accepted','meetup_invite','game_invite'))
);
--> statement-breakpoint
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_meetup_id_meetups_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."meetups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_page" ON "app_notifications" USING btree ("user_id","created_at","id");