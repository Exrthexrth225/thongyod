CREATE TABLE "friend_request_sends" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"requester_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "send_not_self" CHECK ("friend_request_sends"."requester_id" <> "friend_request_sends"."recipient_id")
);
--> statement-breakpoint
ALTER TABLE "friend_link_tokens" ADD COLUMN "encrypted_token" text;--> statement-breakpoint
ALTER TABLE "friend_request_sends" ADD CONSTRAINT "friend_request_sends_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_request_sends" ADD CONSTRAINT "friend_request_sends_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_send_quota" ON "friend_request_sends" USING btree ("requester_id","sent_at");
--> statement-breakpoint
INSERT INTO "friend_request_sends" ("request_id", "requester_id", "recipient_id", "sent_at")
SELECT "id", "requester_id", "recipient_id", "created_at" FROM "friendships";
