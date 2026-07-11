CREATE TYPE "public"."composition_source" AS ENUM('CURATED', 'AI');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_composition_trans" (
	"composition_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "place_composition_trans_composition_id_locale_pk" PRIMARY KEY("composition_id","locale")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_composition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"place_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"source" "composition_source" DEFAULT 'CURATED' NOT NULL,
	"example_image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_composition_trans" ADD CONSTRAINT "place_composition_trans_composition_id_place_composition_id_fk" FOREIGN KEY ("composition_id") REFERENCES "public"."place_composition"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_composition" ADD CONSTRAINT "place_composition_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_composition_place_idx" ON "place_composition" USING btree ("place_id");