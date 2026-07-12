CREATE TYPE "public"."collection_status" AS ENUM('ACTIVE', 'HIDDEN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collection_place" (
	"collection_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	CONSTRAINT "collection_place_collection_id_place_id_pk" PRIMARY KEY("collection_id","place_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collection_trans" (
	"collection_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "collection_trans_collection_id_locale_pk" PRIMARY KEY("collection_id","locale")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"status" "collection_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_place" ADD CONSTRAINT "collection_place_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_place" ADD CONSTRAINT "collection_place_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_trans" ADD CONSTRAINT "collection_trans_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_place_place_idx" ON "collection_place" USING btree ("place_id");