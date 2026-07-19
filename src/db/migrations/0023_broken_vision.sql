CREATE TABLE IF NOT EXISTS "certification_image" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cert_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"seq" integer NOT NULL,
	"is_representative" boolean DEFAULT false NOT NULL,
	CONSTRAINT "cert_image_cert_seq_uq" UNIQUE("cert_id","seq"),
	CONSTRAINT "cert_image_key_uq" UNIQUE("image_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "certification_image" ADD CONSTRAINT "certification_image_cert_id_certification_id_fk" FOREIGN KEY ("cert_id") REFERENCES "public"."certification"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cert_image_cert_idx" ON "certification_image" USING btree ("cert_id");
--> statement-breakpoint
INSERT INTO "certification_image" ("id","cert_id","image_key","seq","is_representative")
SELECT gen_random_uuid(), "id", "image_key", 0, true FROM "certification";
--> statement-breakpoint
ALTER TABLE "certification" DROP CONSTRAINT "cert_user_image_uq";
--> statement-breakpoint
ALTER TABLE "certification" DROP COLUMN IF EXISTS "image_key";
