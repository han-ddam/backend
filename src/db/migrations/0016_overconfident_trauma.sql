CREATE TABLE IF NOT EXISTS "place_rating" (
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"score" numeric(2, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_rating_user_id_place_id_pk" PRIMARY KEY("user_id","place_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_rating" ADD CONSTRAINT "place_rating_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_rating" ADD CONSTRAINT "place_rating_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_rating_place_idx" ON "place_rating" USING btree ("place_id");