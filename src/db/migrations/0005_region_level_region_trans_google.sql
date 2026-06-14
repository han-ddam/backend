-- region_i18n -> region_trans (rename, 데이터 보존)
ALTER TABLE "region_i18n" RENAME TO "region_trans";--> statement-breakpoint
ALTER TABLE "region_trans" RENAME CONSTRAINT "region_i18n_region_code_locale_pk" TO "region_trans_region_code_locale_pk";--> statement-breakpoint
ALTER TABLE "region_trans" RENAME CONSTRAINT "region_i18n_region_code_region_code_fk" TO "region_trans_region_code_region_code_fk";--> statement-breakpoint

-- region.level (PROVINCE/DISTRICT) — 기존 행은 parent_code 기준 백필 후 NOT NULL
CREATE TYPE "public"."region_level" AS ENUM('PROVINCE', 'DISTRICT');--> statement-breakpoint
ALTER TABLE "region" ADD COLUMN "level" "public"."region_level";--> statement-breakpoint
UPDATE "region" SET "level" = CASE WHEN "parent_code" IS NULL THEN 'PROVINCE'::"public"."region_level" ELSE 'DISTRICT'::"public"."region_level" END;--> statement-breakpoint
ALTER TABLE "region" ALTER COLUMN "level" SET NOT NULL;--> statement-breakpoint

-- auth_provider 에 GOOGLE 추가
ALTER TYPE "public"."auth_provider" ADD VALUE IF NOT EXISTS 'GOOGLE';
