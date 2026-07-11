CREATE TYPE "public"."certification_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."certification_visibility" AS ENUM('PRIVATE', 'PUBLIC');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"caption" text,
	"visibility" "certification_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"status" "certification_status" DEFAULT 'PENDING' NOT NULL,
	"proximity_pass" boolean NOT NULL,
	"proximity_distance_m" numeric,
	"reject_reason" text,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cert_user_image_uq" UNIQUE("user_id","image_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "score_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"base_points" integer NOT NULL,
	"region_weight" numeric(4, 2) NOT NULL,
	"rarity_weight" numeric(4, 2) NOT NULL,
	"event_multiplier" numeric(4, 2) NOT NULL,
	"weighted_score" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_event_cert_uq" UNIQUE("certification_id"),
	CONSTRAINT "score_event_user_place_uq" UNIQUE("user_id","place_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "certification" ADD CONSTRAINT "certification_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "certification" ADD CONSTRAINT "certification_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "score_event" ADD CONSTRAINT "score_event_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "score_event" ADD CONSTRAINT "score_event_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "score_event" ADD CONSTRAINT "score_event_certification_id_certification_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certification"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cert_user_idx" ON "certification" USING btree ("user_id");