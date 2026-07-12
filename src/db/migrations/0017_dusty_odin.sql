CREATE TABLE IF NOT EXISTS "user_place_bookmark" (
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_place_bookmark_user_id_place_id_pk" PRIMARY KEY("user_id","place_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_place_bookmark" ADD CONSTRAINT "user_place_bookmark_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_place_bookmark" ADD CONSTRAINT "user_place_bookmark_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_place_bookmark_place_idx" ON "user_place_bookmark" USING btree ("place_id");