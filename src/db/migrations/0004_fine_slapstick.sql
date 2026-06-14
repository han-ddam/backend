CREATE TABLE IF NOT EXISTS "region_i18n" (
	"region_code" varchar(10) NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "region_i18n_region_code_locale_pk" PRIMARY KEY("region_code","locale")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "region_i18n" ADD CONSTRAINT "region_i18n_region_code_region_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."region"("code") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN IF EXISTS "name_ko";--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN IF EXISTS "name_en";--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN IF EXISTS "name_ja";--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN IF EXISTS "name_zh";