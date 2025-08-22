CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/New_York',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"stitch_id" integer NOT NULL,
	"source_file" varchar(255),
	"original_row_id" integer,
	"matched_on" jsonb NOT NULL,
	"match_pass" varchar(24) NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'queued',
	"started_at" timestamp,
	"finished_at" timestamp,
	"result_url" text,
	"meta" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"column_map" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"upload_id" integer NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"name" varchar(160),
	"phone" varchar(32),
	"email" varchar(320),
	"gclid" varchar(128),
	"client_id" varchar(64),
	"utm_source" varchar(80),
	"utm_medium" varchar(80),
	"utm_campaign" varchar(160),
	"landing_page" text,
	"location" varchar(120),
	"duration_sec" integer,
	"amount" numeric(12, 2),
	"external_id" varchar(128),
	"original" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"monthly_limit" integer NOT NULL,
	"price_usd" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"yaml" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stitch_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"stitch_id" integer NOT NULL,
	"normalized_row_id" integer NOT NULL,
	"match_pass" varchar(24) NOT NULL,
	"matched_on" jsonb NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "stitched_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"stitch_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"lead_created_at" timestamp NOT NULL,
	"name" varchar(160),
	"phone" varchar(32),
	"email" varchar(320),
	"location" varchar(120),
	"revenue" numeric(12, 2) DEFAULT '0',
	"confidence" numeric(3, 2) DEFAULT '0.0',
	"final_channel" varchar(80),
	"final_source" varchar(80),
	"final_medium" varchar(80),
	"final_campaign" varchar(160),
	"first_touch_source" varchar(80),
	"last_touch_source" varchar(80),
	"paid_last_source" varchar(80)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"stripe_customer_id" varchar(64),
	"stripe_sub_id" varchar(64),
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"filename" varchar(255) NOT NULL,
	"bytes" integer NOT NULL,
	"detected_type" varchar(40),
	"status" varchar(20) DEFAULT 'uploaded',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"stitched_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'member',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_stitch_id_stitched_leads_id_fk" FOREIGN KEY ("stitch_id") REFERENCES "public"."stitched_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_templates" ADD CONSTRAINT "mapping_templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_rows" ADD CONSTRAINT "normalized_rows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_rows" ADD CONSTRAINT "normalized_rows_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitch_links" ADD CONSTRAINT "stitch_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitch_links" ADD CONSTRAINT "stitch_links_stitch_id_stitched_leads_id_fk" FOREIGN KEY ("stitch_id") REFERENCES "public"."stitched_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitch_links" ADD CONSTRAINT "stitch_links_normalized_row_id_normalized_rows_id_fk" FOREIGN KEY ("normalized_row_id") REFERENCES "public"."normalized_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitched_leads" ADD CONSTRAINT "stitched_leads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "normrows_account_time_idx" ON "normalized_rows" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "normrows_account_phone_idx" ON "normalized_rows" USING btree ("account_id","phone");--> statement-breakpoint
CREATE INDEX "normrows_account_email_idx" ON "normalized_rows" USING btree ("account_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "acct_stitchid_idx" ON "stitched_leads" USING btree ("account_id","stitch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_account_period_idx" ON "usage_counters" USING btree ("account_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");