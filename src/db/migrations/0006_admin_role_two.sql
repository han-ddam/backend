-- admin_role을 SUPER_ADMIN/ADMIN 2개로 축소 (MODERATOR/CURATOR 제거)
-- Postgres는 enum 값 DROP이 안 되므로 enum 재생성. 기존 MODERATOR/CURATOR 행은 ADMIN으로 다운그레이드.
UPDATE "admin" SET "role" = 'ADMIN' WHERE "role" NOT IN ('SUPER_ADMIN', 'ADMIN');--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."admin_role" RENAME TO "admin_role_old";--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('SUPER_ADMIN', 'ADMIN');--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "role" TYPE "public"."admin_role" USING "role"::text::"public"."admin_role";--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "role" SET DEFAULT 'ADMIN';--> statement-breakpoint
DROP TYPE "public"."admin_role_old";
