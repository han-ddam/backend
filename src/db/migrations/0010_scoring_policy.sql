CREATE TABLE IF NOT EXISTS "region_weight" (
	"region_code" varchar(10) PRIMARY KEY NOT NULL,
	"weight" numeric(4, 2) DEFAULT '1.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "score_rule" (
	"action" text PRIMARY KEY NOT NULL,
	"base_points" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "region_weight" ADD CONSTRAINT "region_weight_region_code_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "score_rule" ("action", "base_points") VALUES ('CERT_PHOTO', 15) ON CONFLICT DO NOTHING;
