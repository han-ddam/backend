CREATE TABLE IF NOT EXISTS "user_place_representative" (
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"cert_image_id" uuid NOT NULL,
	CONSTRAINT "user_place_representative_user_id_place_id_pk" PRIMARY KEY("user_id","place_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_region_representative" (
	"user_id" uuid NOT NULL,
	"province_code" text NOT NULL,
	"cert_image_id" uuid NOT NULL,
	CONSTRAINT "user_region_representative_user_id_province_code_pk" PRIMARY KEY("user_id","province_code")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_place_representative" ADD CONSTRAINT "user_place_representative_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_place_representative" ADD CONSTRAINT "user_place_representative_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_place_representative" ADD CONSTRAINT "user_place_representative_cert_image_id_certification_image_id_fk" FOREIGN KEY ("cert_image_id") REFERENCES "public"."certification_image"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_region_representative" ADD CONSTRAINT "user_region_representative_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_region_representative" ADD CONSTRAINT "user_region_representative_cert_image_id_certification_image_id_fk" FOREIGN KEY ("cert_image_id") REFERENCES "public"."certification_image"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cert_user_created_idx" ON "certification" USING btree ("user_id","created_at");