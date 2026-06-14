CREATE TYPE "public"."place_status" AS ENUM('ACTIVE', 'HIDDEN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_trans" (
	"place_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"description" text,
	"mission" text,
	CONSTRAINT "place_trans_place_id_locale_pk" PRIMARY KEY("place_id","locale")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place" (
	"id" uuid PRIMARY KEY NOT NULL,
	"region_code" varchar(10) NOT NULL,
	"tourapi_content_id" text,
	"lat" double precision,
	"lng" double precision,
	"base_points" integer DEFAULT 0 NOT NULL,
	"rarity_weight" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"status" "place_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_tourapi_content_id_unique" UNIQUE("tourapi_content_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_trans" ADD CONSTRAINT "place_trans_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place" ADD CONSTRAINT "place_region_code_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."region"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
