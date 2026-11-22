CREATE TABLE "auth_login_attempts" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"browser_hash" text NOT NULL,
	"encrypted_data" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_signup_tickets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"encrypted_data" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempt_expiry" ON "auth_login_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "signup_ticket_expiry" ON "auth_signup_tickets" USING btree ("expires_at");