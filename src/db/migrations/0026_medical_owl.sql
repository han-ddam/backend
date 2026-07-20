CREATE TABLE IF NOT EXISTS "score_weight_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"visit_weight" numeric(4, 2) NOT NULL,
	"photo_weight" numeric(4, 2) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "weight_config_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place" ADD CONSTRAINT "place_weight_config_id_score_weight_config_id_fk" FOREIGN KEY ("weight_config_id") REFERENCES "public"."score_weight_config"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
