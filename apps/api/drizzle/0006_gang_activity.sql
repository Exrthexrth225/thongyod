CREATE TABLE "activity_epoch" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"cursor_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	CONSTRAINT "activity_singleton" CHECK ("activity_epoch"."singleton")
);
--> statement-breakpoint
CREATE TABLE "gang_activity_reads" (
	"membership_id" uuid PRIMARY KEY NOT NULL,
	"read_snapshot" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"last_opened_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_read_snapshot" CHECK ("gang_activity_reads"."read_snapshot"::txid_snapshot is not null)
);
--> statement-breakpoint
ALTER TABLE "meetups" ADD COLUMN "activity_txid" bigint DEFAULT txid_current() NOT NULL;--> statement-breakpoint
ALTER TABLE "gang_activity_reads" ADD CONSTRAINT "gang_activity_reads_membership_id_gang_members_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."gang_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetup_activity_page" ON "meetups" USING btree ("gang_id","created_at","id");
--> statement-breakpoint
INSERT INTO "activity_epoch" DEFAULT VALUES;
